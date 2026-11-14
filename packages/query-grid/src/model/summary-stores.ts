import type { DataSource } from "./data-source.ts";
import type { Listener } from "./emitter.ts";
import { getField, isLookupField } from "./field-types.ts";
import { labelKey } from "./format.ts";
import {
  createQueryResource,
  type QueryResource,
  type ResourceState,
} from "./query-resource.ts";
import type { QueryStore } from "./query-store.ts";
import { createStore } from "./store.ts";
import type { CountResult, FacetCount, TotalResult } from "./wire-types.ts";

export type CountState = ResourceState<CountResult | null>;
export type TotalState = ResourceState<TotalResult | null>;
export type FacetState = ResourceState<FacetCount[]>;

type ResourceStore<R> = Pick<
  QueryResource<R>,
  "getState" | "subscribe" | "reload"
>;

export interface CountStore extends ResourceStore<CountResult | null> {
  requestExact: () => void;
}

export type TotalStore = ResourceStore<TotalResult | null>;
export type FacetStore = ResourceStore<FacetCount[]>;

export function createCountStore(
  store: QueryStore,
  source: DataSource,
): CountStore {
  const resource = createQueryResource<CountResult | null>(
    store,
    (query, signal) => source.fetchCount(query, false, signal),
    { initial: null },
  );
  return {
    getState: resource.getState,
    subscribe: resource.subscribe,
    reload: resource.reload,
    requestExact: () =>
      resource.refine((query, signal) =>
        source.fetchCount(query, true, signal),
      ),
  };
}

export function createTotalStore(
  store: QueryStore,
  source: DataSource,
): TotalStore {
  return createQueryResource<TotalResult | null>(
    store,
    (query, signal) => source.fetchTotal(query, signal),
    { initial: null },
  );
}

export function createFacetStore(
  store: QueryStore,
  source: DataSource,
): FacetStore {
  return createQueryResource<FacetCount[]>(
    store,
    (query, signal) => source.fetchFacets(query, signal),
    {
      initial: [],
      keepResult: true,
      followsFilters: source.capabilities.mode === "memory",
    },
  );
}

export interface LabelStore {
  getLabels: () => Record<string, string>;
  subscribe: (listener: Listener) => () => void;
  remember: (field: string, value: string, label: string) => void;
}

export function createLabelStore(
  store: QueryStore,
  source: DataSource,
): LabelStore {
  const labels = createStore<Record<string, string>>({});
  const requested = new Set<string>();
  let started = false;
  const remember = (field: string, value: string, label: string) => {
    const key = labelKey(field, value);
    if (labels.get()[key] !== label) {
      labels.set({ ...labels.get(), [key]: label });
    }
  };
  const resolve = async (field: string, value: string) => {
    try {
      const options = await source.fetchOptions(
        field,
        { value },
        new AbortController().signal,
      );
      const match = options.find((option) => option.value === value);
      if (match) {
        remember(field, value, match.label);
      }
    } catch {
      requested.delete(labelKey(field, value));
    }
  };
  const request = (field: string, value: string) => {
    const key = labelKey(field, value);
    if (!requested.has(key) && labels.get()[key] === undefined) {
      requested.add(key);
      void resolve(field, value);
    }
  };
  const requestSelected = () => {
    for (const [key, values] of Object.entries(store.getQuery().equals)) {
      const field = getField(store.def, key);
      if (field && isLookupField(field)) {
        values.forEach((value) => request(key, value));
      }
    }
  };
  return {
    getLabels: labels.get,
    subscribe: (listener) => {
      if (!started) {
        started = true;
        store.subscribe(requestSelected);
        requestSelected();
      }
      return labels.subscribe(listener);
    },
    remember,
  };
}
