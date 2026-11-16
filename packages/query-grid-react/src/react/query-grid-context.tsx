"use client";

import { createContext, use } from "react";

import type {
  Board,
  BoardMove,
  CountStore,
  DataSource,
  FacetStore,
  Feed,
  FieldOption,
  GridRow,
  GridView,
  LabelStore,
  LimitsStore,
  NarrowedStore,
  QueryAction,
  QueryScope,
  QueryStore,
  RowMove,
  Store,
  TotalStore,
} from "@kikstart/query-grid";

import type { ColumnStore } from "../components/column-state.ts";
import type { GridDef } from "../components/fields.ts";

export interface SelectionState {
  ids: string[];
  allMatching: boolean;
  key: number;
}

export interface QueryGridState {
  store: QueryStore;
  feed: Feed;
  counts: CountStore;
  totals: TotalStore;
  facets: FacetStore;
  labels: LabelStore;
  limits: LimitsStore;
  narrowed: NarrowedStore;
  columns: ColumnStore;
  selection: Store<SelectionState>;
}

export interface QueryGridActions {
  dispatch: (action: QueryAction) => void;
  loadMore: () => void;
  requestExact: () => void;
  setView: (view: GridView) => void;
  rememberLabel: (field: string, value: string, label: string) => void;
  loadOptions: (
    field: string,
    text: string,
    signal: AbortSignal,
  ) => Promise<FieldOption[]>;
  moveRow: (board: Board, move: BoardMove) => Promise<GridRow>;
  fetchExport: (columns?: string[]) => Promise<string>;
  clearSelection: () => void;
  reorderRow: (move: RowMove) => Promise<void>;
}

export interface QueryGridMeta {
  def: GridDef;
  source: DataSource;
  scope: QueryScope | null;
}

export interface QueryGridContextValue {
  state: QueryGridState;
  actions: QueryGridActions;
  meta: QueryGridMeta;
}

export const QueryGridContext = createContext<QueryGridContextValue | null>(
  null,
);

function useQueryGrid(): QueryGridContextValue {
  const value = use(QueryGridContext);
  if (!value) {
    throw new Error("useQueryGrid needs a QueryGridProvider above it");
  }
  return value;
}

export function useQueryGridState(): QueryGridState {
  return useQueryGrid().state;
}

export function useQueryGridActions(): QueryGridActions {
  return useQueryGrid().actions;
}

export function useQueryGridMeta(): QueryGridMeta {
  return useQueryGrid().meta;
}
