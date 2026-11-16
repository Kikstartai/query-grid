import type { SortState } from "./grid-def.ts";

export interface RangeInput {
  min: string | null;
  max: string | null;
  preset?: string;
  exclude?: boolean;
  minExclusive?: boolean;
  maxExclusive?: boolean;
}

export interface RangeState extends RangeInput {
  field: string;
}

export const TEXT_OPS = [
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "not_equals",
] as const;

export type TextOp = (typeof TEXT_OPS)[number];

export interface TextState {
  field: string;
  op: TextOp;
  value: string;
}

export type MatchMode = "all" | "any";

export interface QueryState {
  equals: Record<string, string[]>;
  ranges: RangeState[];
  texts: TextState[];
  overlaps: Record<string, string[]>;
  match: MatchMode;
  search: string | null;
  sort: SortState;
  thenBy?: SortState[];
  group: string | null;
  cursor: string | null;
}

export const TEXT_MAX_LENGTH = 80;
export const TEXT_FILTER_MAX = 8;
export const RANGE_FILTER_MAX = 12;
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

export function getRange(query: QueryState, key: string): RangeState | null {
  return query.ranges.find((range) => range.field === key) ?? null;
}

export function listRanges(query: QueryState, key: string): RangeState[] {
  return query.ranges.filter((range) => range.field === key);
}
