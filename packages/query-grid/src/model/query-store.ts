import type {
  Capabilities,
  BaseGridDef,
  QueryRules,
  QueryState,
} from "./field-types.ts";
import {
  applyAction,
  defaultQuery,
  type QueryAction,
} from "./query-actions.ts";
import { validateQueryValues } from "./query-validate.ts";
import { createStore } from "./store.ts";

export type GridView = "grid" | "list" | "board";

export type HistoryWrite = "push" | "replace";

export const GRID_VIEWS: readonly GridView[] = ["grid", "list", "board"];

export interface QueryStore {
  def: BaseGridDef;
  getQuery: () => QueryState;
  getView: () => GridView;
  getRules: () => QueryRules;
  getHistoryWrite: () => HistoryWrite;
  subscribe: (listener: () => void) => () => void;
  dispatch: (action: QueryAction) => void;
  setView: (view: GridView) => void;
  replace: (query: QueryState, view?: GridView) => void;
  setSearchComplete: (complete: boolean) => void;
}

export function normalizeQuery(
  def: BaseGridDef,
  capabilities: Capabilities,
  query: QueryState,
): QueryState {
  const usable =
    capabilities.isAnswerable(query) &&
    validateQueryValues(def, query) === null;
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
  rules: QueryRules;
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
    range: sameJson(current.range, next.range) ? current.range : next.range,
    sort: sameJson(current.sort, next.sort) ? current.sort : next.sort,
  };
}

export function createQueryStore(
  def: BaseGridDef,
  capabilities: Capabilities,
  initial: QueryState,
  initialView: GridView = "grid",
): QueryStore {
  const store = createStore<QueryStoreState>({
    query: normalizeQuery(def, capabilities, initial),
    view: initialView,
    rules: { capabilities, searchComplete: false },
    historyWrite: "replace",
  });
  const change = (patch: Partial<QueryStoreState>) =>
    store.set({ ...store.get(), ...patch });
  return {
    def,
    getQuery: () => store.get().query,
    getView: () => store.get().view,
    getRules: () => store.get().rules,
    getHistoryWrite: () => store.get().historyWrite,
    subscribe: store.subscribe,
    dispatch: (action) => {
      const { query, rules } = store.get();
      const next = applyAction(def, query, action, rules);
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
    setSearchComplete: (searchComplete) => {
      const { rules } = store.get();
      if (searchComplete !== rules.searchComplete) {
        change({ rules: { ...rules, searchComplete } });
      }
    },
  };
}
