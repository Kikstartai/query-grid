import type {
  DataSourceCapabilities,
  BaseGridDef,
  NarrowedState,
  OfferContext,
  QueryState,
} from "./field-types.ts";
import {
  applyAction,
  defaultQuery,
  type QueryAction,
} from "./query-actions.ts";
import { toLiteralQuery } from "./literal-filters.ts";
import { validateQueryValues } from "./query-validate.ts";
import { createStore } from "./store.ts";

export type GridView = "grid" | "list" | "board";

export type HistoryWrite = "push" | "replace";

export const GRID_VIEWS: readonly GridView[] = ["grid", "list", "board"];

export interface QueryStore {
  def: BaseGridDef;
  getQuery: () => QueryState;
  getView: () => GridView;
  getOfferContext: () => OfferContext;
  getHistoryWrite: () => HistoryWrite;
  subscribe: (listener: () => void) => () => void;
  dispatch: (action: QueryAction) => void;
  setView: (view: GridView) => void;
  replace: (query: QueryState, view?: GridView) => void;
  setAllSearchMatchesLoaded: (complete: boolean) => void;
  setNarrowed: (narrowed: NarrowedState | null) => void;
}

export function normalizeQuery(
  def: BaseGridDef,
  capabilities: DataSourceCapabilities,
  query: QueryState,
): QueryState {
  const usable =
    capabilities.canRun(query) &&
    validateQueryValues(def, toLiteralQuery(def, query, null)) === null;
  return usable ? query : defaultQuery(def);
}

function resolveHistoryWrite(action: QueryAction): HistoryWrite {
  return action.type === "setSearch" || action.type === "clearSearch"
    ? "replace"
    : "push";
}

interface QueryStoreState {
  query: QueryState;
  view: GridView;
  context: OfferContext;
  historyWrite: HistoryWrite;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function reuseQuery(current: QueryState, next: QueryState): QueryState {
  if (sameJson(current, next)) {
    return current;
  }
  return {
    ...next,
    equals: sameJson(current.equals, next.equals)
      ? current.equals
      : next.equals,
    ranges: sameJson(current.ranges, next.ranges)
      ? current.ranges
      : next.ranges,
    texts: sameJson(current.texts, next.texts) ? current.texts : next.texts,
    overlaps: sameJson(current.overlaps, next.overlaps)
      ? current.overlaps
      : next.overlaps,
    sort: sameJson(current.sort, next.sort) ? current.sort : next.sort,
  };
}

export function createQueryStore(
  def: BaseGridDef,
  capabilities: DataSourceCapabilities,
  initial: QueryState,
  initialView: GridView = "grid",
): QueryStore {
  const store = createStore<QueryStoreState>({
    query: normalizeQuery(def, capabilities, initial),
    view: initialView,
    context: { capabilities, allSearchMatchesLoaded: false, narrowed: null },
    historyWrite: "replace",
  });
  const change = (patch: Partial<QueryStoreState>) =>
    store.set({ ...store.get(), ...patch });
  return {
    def,
    getQuery: () => store.get().query,
    getView: () => store.get().view,
    getOfferContext: () => store.get().context,
    getHistoryWrite: () => store.get().historyWrite,
    subscribe: store.subscribe,
    dispatch: (action) => {
      const { query, context } = store.get();
      const next = applyAction(def, query, action, context);
      if (next !== query) {
        change({ query: next, historyWrite: resolveHistoryWrite(action) });
      }
    },
    setView: (view) => {
      if (view !== store.get().view) {
        change({ view, historyWrite: "push" });
      }
    },
    replace: (next, view = store.get().view) =>
      change({
        query: reuseQuery(
          store.get().query,
          normalizeQuery(def, capabilities, next),
        ),
        view,
        historyWrite: "replace",
      }),
    setAllSearchMatchesLoaded: (allSearchMatchesLoaded) => {
      const { context } = store.get();
      if (allSearchMatchesLoaded !== context.allSearchMatchesLoaded) {
        change({ context: { ...context, allSearchMatchesLoaded } });
      }
    },
    setNarrowed: (narrowed) => {
      const { context } = store.get();
      if (!sameJson(narrowed, context.narrowed ?? null)) {
        change({ context: { ...context, narrowed } });
      }
    },
  };
}
