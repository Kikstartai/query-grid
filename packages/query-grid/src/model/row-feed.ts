import type { DataSource } from "./data-source.ts";
import { createEmitter, type Listener } from "./emitter.ts";
import type { GridRow, QueryState } from "./field-types.ts";
import {
  createAbortable,
  isAbort,
  sameFilters,
  type LoadStatus,
} from "./load.ts";
import { toProblem, type Problem } from "./problems.ts";
import type { QueryStore } from "./query-store.ts";
import { sortRows } from "./sort-rows.ts";

export interface FeedState {
  query: QueryState;
  rows: GridRow[];
  status: LoadStatus;
  hasNext: boolean;
  capped: boolean;
  pages: number;
  error: Problem | null;
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

export function createFeed(
  store: QueryStore,
  source: DataSource,
  pageSize: number,
): Feed {
  const emitter = createEmitter();
  const def = store.def;
  const sortsQuickLocally = source.capabilities.mode === "server";
  let started = false;
  const begin = createAbortable();
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
    const controller = begin();
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
      const sortLocally = sortsQuickLocally && query.quick !== null && !capped;
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
        set({ status: "error", error: toProblem(error) });
      }
    }
  };

  const restart = () => {
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
      const index = state.rows.findIndex((row) => row.id === id);
      if (index < 0) {
        return;
      }
      const rows = state.rows.slice();
      rows[index] = { ...rows[index], ...patch } as GridRow;
      set({ rows });
    },
    removeRow: (id) => {
      insertedIds.delete(id);
      if (state.rows.some((row) => row.id === id)) {
        set({ rows: state.rows.filter((row) => row.id !== id) });
      }
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
