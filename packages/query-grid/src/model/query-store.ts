import { createEmitter } from "./emitter.ts";
import type {
  Capabilities,
  GridDef,
  QueryRules,
  QueryState,
} from "./field-types.ts";
import { applyAction, type QueryAction } from "./query-actions.ts";

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

function resolveHistoryWrite(action: QueryAction): HistoryWrite {
  return action.type === "setQuick" || action.type === "clearQuick"
    ? "replace"
    : "push";
}

export function createQueryStore(
  def: GridDef,
  capabilities: Capabilities,
  initial: QueryState,
  initialView: GridView = "grid",
): QueryStore {
  let query = initial;
  let view = initialView;
  let rules: QueryRules = { capabilities, quickComplete: false };
  let historyWrite: HistoryWrite = "replace";
  const emitter = createEmitter();
  return {
    def,
    getQuery: () => query,
    getView: () => view,
    getRules: () => rules,
    getHistoryWrite: () => historyWrite,
    subscribe: emitter.add,
    dispatch: (action) => {
      const next = applyAction(def, query, action, rules);
      if (next !== query) {
        query = next;
        historyWrite = resolveHistoryWrite(action);
        emitter.emit();
      }
    },
    setView: (next) => {
      if (next !== view) {
        view = next;
        historyWrite = "push";
        emitter.emit();
      }
    },
    replace: (next, nextView = view) => {
      query = next;
      view = nextView;
      historyWrite = "replace";
      emitter.emit();
    },
    setQuickComplete: (complete) => {
      if (complete !== rules.quickComplete) {
        rules = { ...rules, quickComplete: complete };
        emitter.emit();
      }
    },
  };
}
