import type { GridRow } from "./field-types.ts";
import type { Problem } from "./problems.ts";

export interface PageResult {
  rows: GridRow[];
  nextCursor: string | null;
  hasNext: boolean;
}

export type CountSource = "counter" | "capped" | "exact";

export interface CountResult {
  count: number;
  capped: boolean;
  source: CountSource;
}

export interface FacetCount {
  value: string;
  count: number;
  sums?: Record<string, number>;
}

export interface TotalAvailable {
  field: string;
  available: true;
  sum: number;
  rows: number;
  source: "counter" | "live";
}

export interface TotalUnavailable extends Problem {
  field: string;
  available: false;
}

export type TotalResult = TotalAvailable | TotalUnavailable;

export interface OptionSearch {
  query?: string;
  value?: string;
}

export const PAGE_LIMIT_MAX = 1000;
export const SEARCH_LIMIT = 500;
export const COUNT_CAP = 10_000;
