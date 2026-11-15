"use client";

import { useEffect, useState } from "react";

import type { BaseFieldDef } from "@kikstart/query-grid";

import {
  createColumnStore,
  defaultColumns,
  NO_PERSISTENCE,
  normalizeColumns,
  type ColumnPersistence,
  type ColumnState,
  type ColumnUpdate,
} from "./column-state.ts";
import { useLatest } from "./use-latest.ts";
import { useStoreValue } from "./use-store-value.ts";

interface ColumnStateOptions {
  fields: BaseFieldDef[];
  columns?: ColumnState[];
  onColumnsChange?: (columns: ColumnState[]) => void;
  columnPersistence?: ColumnPersistence;
}

interface ColumnStateModel {
  columns: ColumnState[];
  update: (change: ColumnUpdate) => void;
}

export function useColumnState(options: ColumnStateOptions): ColumnStateModel {
  const { fields } = options;
  const controlled = options.columns !== undefined;
  const [store] = useState(() =>
    createColumnStore(fields, options.columnPersistence ?? NO_PERSISTENCE),
  );
  const own = useStoreValue(store.subscribe, store.getColumns);
  const columns =
    normalizeColumns(fields, options.columns ?? own) ?? defaultColumns(fields);
  const latest = useLatest({ options, columns });

  useEffect(() => {
    if (!controlled) {
      void store.restore();
    }
  }, [store, controlled]);

  const update = (change: ColumnUpdate) => {
    const { options: current } = latest.current;
    const base =
      current.columns === undefined
        ? store.getColumns()
        : latest.current.columns;
    const next = change(base);
    store.setColumns(next);
    current.onColumnsChange?.(next);
  };

  return { columns, update };
}
