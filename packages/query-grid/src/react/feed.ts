import type { DataSource } from "../model/data-source.ts";
import type { GridRow, QueryState } from "../model/field-types.ts";
import { sortRows } from "../model/memory-source.ts";
import type { QueryStore } from "../model/query-store.ts";
import type {
  CountResult,
  FacetCount,
  TotalResult,
} from "../model/wire-types.ts";

type Listener = () => void;

export type LoadStatus = "idle" | "loading" | "error";

export interface FeedState {
  query: QueryState;
  rows: GridRow[];
  status: LoadStatus;
  hasNext: boolean;
  capped: boolean;
  pages: number;
  error: string | null;
}

export interface Feed {
  getState: () => FeedState;
  subscribe: (listener: Listener) => () => void;
  loadMore: () => void;
  patchRow: (id: string, patch: Partial<GridRow>) => void;
  removeRow: (id: string) => void;
  insertRow: (index: number, row: GridRow) => void;
  reload: () => void;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "request failed";
}

interface Emitter {
  emit: () => void;
  add: (listener: Listener) => () => void;
}

function createEmitter(): Emitter {
  const listeners = new Set<Listener>();
  return {
    emit: () => listeners.forEach((listener) => listener()),
    add: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function initialFeedState(query: QueryState): FeedState {
  return {
    query,
    rows: [],
    status: "idle",
    hasNext: true,
    capped: false,
    pages: 0,
    error: null,
  };
}

function sameFilters(a: QueryState, b: QueryState): boolean {
  return a.equals === b.equals && a.range === b.range && a.quick === b.quick;
}

export function createFeed(
  store: QueryStore,
  source: DataSource,
  pageSize: number,
): Feed {
  const emitter = createEmitter();
  const def = store.def;
  const sortsQuickLocally = source.mode === "indexed";
  let started = false;
  let abort: AbortController | null = null;
  let nextCursor: string | null = null;
  const insertedIds = new Set<string>();
  let state = initialFeedState(store.getQuery());

  const set = (patch: Partial<FeedState>) => {
    state = { ...state, ...patch };
    emitter.emit();
  };

  const isQuickComplete = () =>
    sortsQuickLocally &&
    state.query.quick !== null &&
    state.pages > 0 &&
    state.status === "idle" &&
    !state.capped;

  const load = async () => {
    const query = state.query;
    const controller = new AbortController();
    abort = controller;
    set({ status: "loading", error: null });
    try {
      const page = await source.fetchPage(
        { ...query, cursor: nextCursor },
        pageSize,
        controller.signal,
      );
      if (controller.signal.aborted) {
        return;
      }
      nextCursor = page.nextCursor;
      const capped = page.hasNext && page.nextCursor === null;
      const fresh = page.rows.filter((row) => !insertedIds.has(row.id));
      const sortLocally =
        sortsQuickLocally && query.quick !== null && !capped;
      set({
        rows: sortLocally
          ? sortRows(def, fresh, query.sort)
          : state.rows.concat(fresh),
        status: "idle",
        hasNext: page.nextCursor !== null,
        capped,
        pages: state.pages + 1,
      });
      store.setQuickComplete(isQuickComplete());
    } catch (error) {
      if (!isAbort(error)) {
        set({ status: "error", error: messageOf(error) });
      }
    }
  };

  const restart = () => {
    abort?.abort();
    insertedIds.clear();
    state = initialFeedState(store.getQuery());
    nextCursor = state.query.cursor;
    store.setQuickComplete(false);
    void load();
  };

  const follow = () => {
    const next = store.getQuery();
    if (next === state.query) {
      return;
    }
    const resort = isQuickComplete() && sameFilters(next, state.query);
    if (resort) {
      set({ query: next, rows: sortRows(def, state.rows, next.sort) });
      return;
    }
    restart();
  };

  const start = () => {
    if (started) {
      return;
    }
    started = true;
    store.subscribe(follow);
    restart();
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      start();
      return emitter.add(listener);
    },
    loadMore: () => {
      if (state.status === "idle" && state.hasNext) {
        void load();
      }
    },
    patchRow: (id, patch) => {
      set({
        rows: state.rows.map((row) =>
          row.id === id ? ({ ...row, ...patch } as GridRow) : row,
        ),
      });
    },
    removeRow: (id) => {
      insertedIds.delete(id);
      set({ rows: state.rows.filter((row) => row.id !== id) });
    },
    insertRow: (index, row) => {
      insertedIds.add(row.id);
      set({
        rows: [...state.rows.slice(0, index), row, ...state.rows.slice(index)],
      });
    },
    reload: restart,
  };
}

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
  let abort: AbortController | null = null;
  let state: CountState = {
    query: store.getQuery(),
    result: null,
    status: "idle",
  };

  const load = async (exact: boolean) => {
    abort?.abort();
    const controller = new AbortController();
    abort = controller;
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
  error: string | null;
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
  let abort: AbortController | null = null;
  let state: TotalState = {
    query: store.getQuery(),
    result: null,
    status: "idle",
    error: null,
  };

  const load = async () => {
    abort?.abort();
    const controller = new AbortController();
    abort = controller;
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
        state = { ...state, status: "error", error: messageOf(error) };
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
  let abort: AbortController | null = null;
  let query = store.getQuery();
  let state: FacetState = { counts: [], status: "idle" };

  const load = async () => {
    abort?.abort();
    const controller = new AbortController();
    abort = controller;
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
            source.mode === "memory" && !sameFilters(store.getQuery(), query);
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
    const key = `${field}:${value}`;
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
      requested.delete(`${field}:${value}`);
    }
  };
  return {
    getLabels: () => labels,
    subscribe: emitter.add,
    remember,
    request: (field, value) => {
      const key = `${field}:${value}`;
      if (!requested.has(key) && labels[key] === undefined) {
        requested.add(key);
        void resolve(field, value);
      }
    },
  };
}
