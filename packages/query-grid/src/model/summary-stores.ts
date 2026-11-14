import type { DataSource } from "./data-source.ts";
import { createEmitter, type Listener } from "./emitter.ts";
import type { QueryState } from "./field-types.ts";
import { labelKey } from "./format.ts";
import {
  createAbortable,
  isAbort,
  sameFilters,
  type LoadStatus,
} from "./load.ts";
import { toProblem, type Problem } from "./problems.ts";
import type { QueryStore } from "./query-store.ts";
import type { CountResult, FacetCount, TotalResult } from "./wire-types.ts";

export interface CountState {
  query: QueryState;
  result: CountResult | null;
  status: LoadStatus;
}

export interface CountStore {
  getState: () => CountState;
  subscribe: (listener: Listener) => () => void;
  requestExact: () => void;
  reload: () => void;
}

export function createCountStore(
  store: QueryStore,
  source: DataSource,
): CountStore {
  const emitter = createEmitter();
  let started = false;
  const begin = createAbortable();
  let state: CountState = {
    query: store.getQuery(),
    result: null,
    status: "idle",
  };

  const load = async (exact: boolean) => {
    const controller = begin();
    state = { ...state, query: store.getQuery(), status: "loading" };
    if (!exact) {
      state = { ...state, result: null };
    }
    emitter.emit();
    try {
      const result = await source.fetchCount(
        state.query,
        exact,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        state = { ...state, result, status: "idle" };
        emitter.emit();
      }
    } catch (error) {
      if (!isAbort(error)) {
        state = { ...state, status: "error" };
        emitter.emit();
      }
    }
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      if (!started) {
        started = true;
        store.subscribe(() => {
          if (!sameFilters(store.getQuery(), state.query)) {
            void load(false);
          }
        });
        void load(false);
      }
      return emitter.add(listener);
    },
    requestExact: () => void load(true),
    reload: () => void load(false),
  };
}

export interface TotalState {
  query: QueryState;
  result: TotalResult | null;
  status: LoadStatus;
  error: Problem | null;
}

export interface TotalStore {
  getState: () => TotalState;
  subscribe: (listener: Listener) => () => void;
  reload: () => void;
}

export function createTotalStore(
  store: QueryStore,
  source: DataSource,
): TotalStore {
  const emitter = createEmitter();
  let started = false;
  const begin = createAbortable();
  let state: TotalState = {
    query: store.getQuery(),
    result: null,
    status: "idle",
    error: null,
  };

  const load = async () => {
    const controller = begin();
    state = {
      query: store.getQuery(),
      result: null,
      status: "loading",
      error: null,
    };
    emitter.emit();
    try {
      const result = await source.fetchTotal(state.query, controller.signal);
      if (!controller.signal.aborted) {
        state = { ...state, result, status: "idle" };
        emitter.emit();
      }
    } catch (error) {
      if (!isAbort(error)) {
        state = { ...state, status: "error", error: toProblem(error) };
        emitter.emit();
      }
    }
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      if (!started) {
        started = true;
        store.subscribe(() => {
          if (!sameFilters(store.getQuery(), state.query)) {
            void load();
          }
        });
        void load();
      }
      return emitter.add(listener);
    },
    reload: () => void load(),
  };
}

export interface FacetState {
  counts: FacetCount[];
  status: LoadStatus;
}

export interface FacetStore {
  getState: () => FacetState;
  subscribe: (listener: Listener) => () => void;
  reload: () => void;
}

export function createFacetStore(
  store: QueryStore,
  source: DataSource,
): FacetStore {
  const emitter = createEmitter();
  let started = false;
  const begin = createAbortable();
  let query = store.getQuery();
  let state: FacetState = { counts: [], status: "idle" };

  const load = async () => {
    const controller = begin();
    query = store.getQuery();
    state = { ...state, status: "loading" };
    emitter.emit();
    try {
      const counts = await source.fetchFacets(query, controller.signal);
      state = { counts, status: "idle" };
    } catch (error) {
      if (isAbort(error)) {
        return;
      }
      state = { ...state, status: "error" };
    }
    emitter.emit();
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      if (!started) {
        started = true;
        store.subscribe(() => {
          const followsQuery =
            source.capabilities.mode === "memory" &&
            !sameFilters(store.getQuery(), query);
          if (followsQuery) {
            void load();
          }
        });
        void load();
      }
      return emitter.add(listener);
    },
    reload: () => void load(),
  };
}

export interface LabelStore {
  getLabels: () => Record<string, string>;
  subscribe: (listener: Listener) => () => void;
  remember: (field: string, value: string, label: string) => void;
  request: (field: string, value: string) => void;
}

export function createLabelStore(source: DataSource): LabelStore {
  const emitter = createEmitter();
  const requested = new Set<string>();
  let labels: Record<string, string> = {};
  const remember = (field: string, value: string, label: string) => {
    const key = labelKey(field, value);
    if (labels[key] !== label) {
      labels = { ...labels, [key]: label };
      emitter.emit();
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
  return {
    getLabels: () => labels,
    subscribe: emitter.add,
    remember,
    request: (field, value) => {
      const key = labelKey(field, value);
      if (!requested.has(key) && labels[key] === undefined) {
        requested.add(key);
        void resolve(field, value);
      }
    },
  };
}
