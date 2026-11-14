"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { FieldDef } from "@kikstart/query-grid";

import {
  COLUMN_SAVE_DELAY_MS,
  defaultColumns,
  normalizeColumns,
  type ColumnPersistence,
  type ColumnState,
  type ColumnUpdate,
} from "./column-state.ts";

export interface ColumnStateOptions {
  fields: FieldDef[];
  columns?: ColumnState[];
  onColumnsChange?: (columns: ColumnState[]) => void;
  columnPersistence?: ColumnPersistence | null;
}

export interface ColumnStateModel {
  columns: ColumnState[];
  update: (change: ColumnUpdate) => void;
}

export function useColumnState(options: ColumnStateOptions): ColumnStateModel {
  const { fields, onColumnsChange } = options;
  const persistence = options.columnPersistence ?? null;
  const controlled = options.columns !== undefined;
  const [own, setOwn] = useState(() => defaultColumns(fields));
  const columns = options.columns ?? own;
  const columnsRef = useRef(columns);
  useLayoutEffect(() => {
    columnsRef.current = columns;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (controlled || !persistence) {
      return;
    }
    let live = true;
    const restore = async () => {
      const stored = normalizeColumns(fields, await persistence.load());
      if (live && stored) {
        setOwn(stored);
      }
    };
    void restore();
    return () => {
      live = false;
    };
  }, [controlled, persistence, fields]);

  const update = (change: ColumnUpdate) => {
    const next = change(columnsRef.current);
    columnsRef.current = next;
    onColumnsChange?.(next);
    if (controlled) {
      return;
    }
    setOwn(next);
    if (!persistence) {
      return;
    }
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(
      () => void persistence.save(next),
      COLUMN_SAVE_DELAY_MS,
    );
  };

  return { columns, update };
}
