import { createStore, type FieldDef } from "@kikstart/query-grid";

import {
  COLUMN_SAVE_DELAY_MS,
  defaultColumns,
  normalizeColumns,
  type ColumnPersistence,
  type ColumnState,
} from "../components/column-state.ts";

export interface ColumnStore {
  getColumns: () => ColumnState[];
  subscribe: (listener: () => void) => () => void;
  setColumns: (columns: ColumnState[]) => void;
  restore: () => Promise<void>;
  reset: () => void;
}

export function createColumnStore(
  fields: FieldDef[],
  persistence: ColumnPersistence | null,
): ColumnStore {
  const store = createStore(defaultColumns(fields));
  let restored = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const set = (next: ColumnState[]) => {
    store.set(next);
    if (!restored || !persistence) {
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(
      () => void persistence.save(store.get()),
      COLUMN_SAVE_DELAY_MS,
    );
  };
  return {
    getColumns: store.get,
    subscribe: store.subscribe,
    setColumns: set,
    restore: async () => {
      if (restored) {
        return;
      }
      const stored = normalizeColumns(fields, await persistence?.load());
      restored = true;
      if (stored) {
        set(stored);
      }
    },
    reset: () => set(defaultColumns(fields)),
  };
}
