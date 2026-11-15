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

export interface GroupHeader {
  value: string;
  label: string | null;
  count: number;
  capped: boolean;
  sums: Record<string, number> | null;
}

export type GroupSource = "counter" | "capped" | "live";

export interface GroupsResult {
  groups: GroupHeader[];
  source: GroupSource;
  truncated: boolean;
}

export interface OptionSearch {
  query?: string;
  value?: string;
}
