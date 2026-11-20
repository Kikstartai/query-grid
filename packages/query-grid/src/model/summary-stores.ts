import type {
  CountResult,
  DataSource,
  FacetCount,
  TotalResult,
} from "./data-source.ts";
import type { Listener } from "./store.ts";
import { getField, hasFixedValues } from "./grid-def.ts";
import type { QueryState } from "./query-state.ts";
import type {
  NarrowedResult,
  NarrowedState,
  DataSourceCapabilities,
} from "./capabilities.ts";
import { labelKey } from "./format.ts";
import type { GridLimits } from "./limits.ts";
import {
  createQueryResource,
  type QueryResource,
  type ResourceState,
} from "./query-resource.ts";
import type { QueryStore } from "./query-store.ts";
import { createStore } from "./store.ts";

export type CountState = ResourceState<CountResult | null>;
export type TotalState = ResourceState<TotalResult[]>;
export type FacetState = ResourceState<FacetCount[]>;

type ResourceStore<R> = Pick<
  QueryResource<R>,
  "getState" | "subscribe" | "reload"
>;

export interface CountStore extends ResourceStore<CountResult | null> {
  requestExact: () => void;
}

export type TotalStore = ResourceStore<TotalResult[]>;
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
  return createQueryResource<TotalResult[]>(
    store,
    (query, signal) => source.fetchTotals(query, signal),
    { initial: [] },
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
      followsFilters: source.capabilities.facetCountsFollowFilters,
    },
  );
}

export interface NarrowedStore {
  connect: () => () => void;
}

function toNarrowedState(
  capabilities: DataSourceCapabilities,
  query: QueryState,
  result: NarrowedResult,
): NarrowedState {
  return {
    ...result,
    andBasis: capabilities.narrowBasis({ ...query, combine: "and" }),
    orBasis: capabilities.narrowBasis({ ...query, combine: "or" }),
  };
}

export function createNarrowedStore(
  store: QueryStore,
  source: DataSource,
): NarrowedStore {
  const resource = createQueryResource<NarrowedResult | null>(
    store,
    (query, signal) => source.fetchNarrowed(query, signal),
    { initial: null, keepResult: true },
  );
  const publish = () => {
    const { query, result, status, loaded } = resource.getState();
    if (status === "idle" && loaded && result) {
      store.setNarrowed(toNarrowedState(source.capabilities, query, result));
    }
  };
  return { connect: () => resource.subscribe(publish) };
}

export interface LimitsStore {
  getLimits: () => GridLimits | null;
  subscribe: (listener: Listener) => () => void;
}

export function createLimitsStore(source: DataSource): LimitsStore {
  const limits = createStore<GridLimits | null>(null);
  let started = false;
  const load = async () => {
    try {
      limits.set(await source.fetchLimits(new AbortController().signal));
    } catch {
      started = false;
    }
  };
  return {
    getLimits: limits.get,
    subscribe: (listener) => {
      if (!started) {
        started = true;
        void load();
      }
      return limits.subscribe(listener);
    },
  };
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
    for (const filter of store.getQuery().filters) {
      const field = getField(store.def, filter.field);
      if (field && !hasFixedValues(field) && "values" in filter) {
        for (const value of filter.values) {
          if (value !== null) {
            request(filter.field, value);
          }
        }
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
