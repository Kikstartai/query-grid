import type { DataSource } from "./data-source.ts";
import type { Listener } from "./store.ts";
import type { GridRow } from "./grid-def.ts";
import type { QueryState } from "./query-state.ts";
import {
  createAbortable,
  isAbort,
  sameFilters,
  type LoadStatus,
} from "./load.ts";
import { toProblem, type Problem } from "./problems.ts";
import type { QueryStore } from "./query-store.ts";
import { sortRows } from "./sort-rows.ts";
import { createStore } from "./store.ts";

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
  const def = store.def;
  const sortsSearchLocally = !source.capabilities.searchIsOrdered;
  const feed = createStore(initialFeedState(store.getQuery()));
  const begin = createAbortable();
  const insertedIds = new Set<string>();
  let started = false;
  let nextCursor: string | null = null;

  const set = (patch: Partial<FeedState>) =>
    feed.set({ ...feed.get(), ...patch });

  const areAllSearchMatchesLoaded = () => {
    const state = feed.get();
    return (
      sortsSearchLocally &&
      state.query.search !== null &&
      state.pages > 0 &&
      state.status === "idle" &&
      !state.capped
    );
  };

  const load = async (base: FeedState) => {
    const query = base.query;
    const controller = begin();
    feed.set({ ...base, status: "loading", error: null });
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
        sortsSearchLocally && query.search !== null && !capped;
      const state = feed.get();
      set({
        rows: sortLocally
          ? sortRows(def, fresh, query.sort, query.thenBy)
          : state.rows.concat(fresh),
        status: "idle",
        hasNext: page.nextCursor !== null,
        capped,
        pages: state.pages + 1,
      });
      store.setAllSearchMatchesLoaded(areAllSearchMatchesLoaded());
    } catch (error) {
      if (!isAbort(error)) {
        set({ status: "error", error: toProblem(error) });
      }
    }
  };

  const restart = () => {
    const initial = initialFeedState(store.getQuery());
    insertedIds.clear();
    nextCursor = initial.query.cursor;
    void load(initial);
    store.setAllSearchMatchesLoaded(false);
  };

  const follow = () => {
    const next = store.getQuery();
    const state = feed.get();
    if (next === state.query) {
      return;
    }
    const resort =
      areAllSearchMatchesLoaded() && sameFilters(next, state.query);
    if (resort) {
      set({
        query: next,
        rows: sortRows(def, state.rows, next.sort, next.thenBy),
      });
      return;
    }
    const sameRows =
      sameFilters(next, state.query) &&
      next.sort === state.query.sort &&
      next.thenBy === state.query.thenBy &&
      next.cursor === state.query.cursor;
    if (sameRows) {
      set({ query: next });
      return;
    }
    restart();
  };

  return {
    getState: feed.get,
    subscribe: (listener) => {
      if (!started) {
        started = true;
        store.subscribe(follow);
        restart();
      }
      return feed.subscribe(listener);
    },
    loadMore: () => {
      const state = feed.get();
      if (state.status === "idle" && state.hasNext) {
        void load(state);
      }
    },
    patchRow: (id, patch) => {
      const rows = feed.get().rows.slice();
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) {
        return;
      }
      rows[index] = { ...rows[index], ...patch } as GridRow;
      set({ rows });
    },
    removeRow: (id) => {
      insertedIds.delete(id);
      const { rows } = feed.get();
      if (rows.some((row) => row.id === id)) {
        set({ rows: rows.filter((row) => row.id !== id) });
      }
    },
    insertRow: (index, row) => {
      insertedIds.add(row.id);
      const { rows } = feed.get();
      set({ rows: [...rows.slice(0, index), row, ...rows.slice(index)] });
    },
    reload: restart,
  };
}
