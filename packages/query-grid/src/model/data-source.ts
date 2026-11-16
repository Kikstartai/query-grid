import type {
  DataSourceCapabilities,
  FieldOption,
  GridRow,
  NarrowedResult,
  QueryState,
} from "./field-types.ts";
import type { GridLimits } from "./limits.ts";
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

export interface DataSource {
  capabilities: DataSourceCapabilities;
  fetchPage: (
    query: QueryState,
    limit: number,
    signal: AbortSignal,
  ) => Promise<PageResult>;
  fetchCount: (
    query: QueryState,
    exact: boolean,
    signal: AbortSignal,
  ) => Promise<CountResult>;
  fetchTotals: (
    query: QueryState,
    signal: AbortSignal,
  ) => Promise<TotalResult[]>;
  fetchFacets: (
    query: QueryState,
    signal: AbortSignal,
  ) => Promise<FacetCount[]>;
  fetchOptions: (
    field: string,
    search: OptionSearch,
    signal: AbortSignal,
  ) => Promise<FieldOption[]>;
  fetchGroups: (
    query: QueryState,
    signal: AbortSignal,
  ) => Promise<GroupsResult>;
  fetchNarrowed: (
    query: QueryState,
    signal: AbortSignal,
  ) => Promise<NarrowedResult | null>;
  fetchLimits: (signal: AbortSignal) => Promise<GridLimits | null>;
  fetchTransitions: (signal: AbortSignal) => Promise<[string, string][]>;
  changeFacetValue: (id: string, to: string) => Promise<GridRow>;
}
