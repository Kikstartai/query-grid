import type {
  Capabilities,
  GridDef,
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
  def: GridDef;
  getQuery: () => QueryState;
  getView: () => GridView;
  getRules: () => QueryRules;
  getHistoryWrite: () => HistoryWrite;
  subscribe: (listener: () => void) => () => void;
  dispatch: (action: QueryAction) => void;
  setView: (view: GridView) => void;
  replace: (query: QueryState, view?: GridView) => void;
  setQuickComplete: (complete: boolean) => void;
}

export function normalizeQuery(
  def: GridDef,
  capabilities: Capabilities,
  query: QueryState,
): QueryState {
  const usable =
    capabilities.isAnswerable(query) &&
    validateQueryValues(def, query) === null;
  return usable ? query : defaultQuery(def);
}

function resolveHistoryWrite(action: QueryAction): HistoryWrite {
  return action.type === "setQuick" || action.type === "clearQuick"
    ? "replace"
    : "push";
}

interface QueryStoreState {
  query: QueryState;
  view: GridView;
  rules: QueryRules;
}

export function createQueryStore(
  def: GridDef,
  capabilities: Capabilities,
  initial: QueryState,
  initialView: GridView = "grid",
): QueryStore {
  const store = createStore<QueryStoreState>({
    query: normalizeQuery(def, capabilities, initial),
    view: initialView,
    rules: { capabilities, quickComplete: false },
  });
  let historyWrite: HistoryWrite = "replace";
  const change = (patch: Partial<QueryStoreState>, write: HistoryWrite) => {
    historyWrite = write;
    store.set({ ...store.get(), ...patch });
  };
  return {
    def,
    getQuery: () => store.get().query,
    getView: () => store.get().view,
    getRules: () => store.get().rules,
    getHistoryWrite: () => historyWrite,
    subscribe: store.subscribe,
    dispatch: (action) => {
      const { query, rules } = store.get();
      const next = applyAction(def, query, action, rules);
      if (next !== query) {
        change({ query: next }, resolveHistoryWrite(action));
      }
    },
    setView: (view) => {
      if (view !== store.get().view) {
        change({ view }, "push");
      }
    },
    replace: (next, view = store.get().view) =>
      change(
        { query: normalizeQuery(def, capabilities, next), view },
        "replace",
      ),
    setQuickComplete: (quickComplete) => {
      const { rules } = store.get();
      if (quickComplete !== rules.quickComplete) {
        change({ rules: { ...rules, quickComplete } }, historyWrite);
      }
    },
  };
}
