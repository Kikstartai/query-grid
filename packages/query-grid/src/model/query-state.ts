import type { DatePreset } from "./date-presets.ts";
import type { SortState } from "./grid-def.ts";
import {
  getOperatorShape,
  type FilterOp,
  type OpOfShape,
} from "./operators.ts";

export interface OneFilter {
  field: string;
  op: OpOfShape<"one">;
  value: string;
}

export interface PairFilter {
  field: string;
  op: OpOfShape<"pair">;
  min: string;
  max: string;
}

export interface ListFilter {
  field: string;
  op: OpOfShape<"list">;
  values: (string | null)[];
}

export interface PresetFilter {
  field: string;
  op: OpOfShape<"preset">;
  preset: DatePreset;
}

export interface NoneFilter {
  field: string;
  op: OpOfShape<"none">;
}

export type Filter =
  | OneFilter
  | PairFilter
  | ListFilter
  | PresetFilter
  | NoneFilter;

export type Combinator = "and" | "or";

export interface QueryState {
  filters: Filter[];
  combine: Combinator;
  search: string | null;
  sort: SortState;
  thenBy?: SortState[];
  group: string | null;
  cursor: string | null;
}

export const TEXT_MAX_LENGTH = 80;
export const FILTER_MAX = 20;
export const SORT_MAX = 3;

export function listThenBy(query: QueryState): SortState[] {
  return query.thenBy ?? [];
}

export function listSorts(query: QueryState): SortState[] {
  return [query.sort, ...listThenBy(query)];
}

export function withThenBy(query: QueryState, thenBy: SortState[]): QueryState {
  return { ...query, thenBy: thenBy.length > 0 ? thenBy : undefined };
}

export function listFieldFilters(query: QueryState, key: string): Filter[] {
  return query.filters.filter((filter) => filter.field === key);
}

export function getFieldFilter(query: QueryState, key: string): Filter | null {
  return listFieldFilters(query, key)[0] ?? null;
}

export function listFilteredFields(query: QueryState): string[] {
  return [...new Set(query.filters.map((filter) => filter.field))];
}

export function isListFilter(filter: Filter): filter is ListFilter {
  return getOperatorShape(filter.op) === "list";
}

export function isOneFilter(filter: Filter): filter is OneFilter {
  return getOperatorShape(filter.op) === "one";
}

export function isPairFilter(filter: Filter): filter is PairFilter {
  return getOperatorShape(filter.op) === "pair";
}

export function isPresetFilter(filter: Filter): filter is PresetFilter {
  return getOperatorShape(filter.op) === "preset";
}

export function hasOp(filter: Filter, ops: readonly FilterOp[]): boolean {
  return ops.includes(filter.op);
}
