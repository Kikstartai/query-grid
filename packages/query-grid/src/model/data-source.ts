import type { FieldOption, GridRow } from "./grid-def.ts";
import type { QueryState } from "./query-state.ts";
import type { DataSourceCapabilities, NarrowedResult } from "./capabilities.ts";
import type { ExportRequest } from "./csv.ts";
import type { GridLimits } from "./limits.ts";
import type { Problem } from "./problems.ts";
import type { RowMove } from "./reorder.ts";

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

export interface QueryMapping {
  fetch: (query: QueryState) => QueryState;
  check: (query: QueryState) => QueryState;
  basis?: (query: QueryState) => QueryState;
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
  fetchExport: (
    query: QueryState,
    request: ExportRequest,
    signal: AbortSignal,
  ) => Promise<string>;
  fetchTransitions: (signal: AbortSignal) => Promise<[string, string][]>;
  changeFacetValue: (id: string, to: string) => Promise<GridRow>;
  reorderRow: (move: RowMove) => Promise<GridRow[]>;
}

// Every member that takes a query is listed here once, so a wrapper that rewrites queries cannot miss one.
export function mapSourceQueries(
  source: DataSource,
  { fetch, check, basis = check }: QueryMapping,
): DataSource {
  const { capabilities } = source;
  return {
    ...source,
    capabilities: {
      ...capabilities,
      canRun: (query) => capabilities.canRun(check(query)),
      isNarrowed: (query) => capabilities.isNarrowed(check(query)),
      narrowBasis: (query) => capabilities.narrowBasis(basis(query)),
      isFacetCountExact: (query) =>
        capabilities.isFacetCountExact(check(query)),
    },
    fetchPage: (query, limit, signal) =>
      source.fetchPage(fetch(query), limit, signal),
    fetchCount: (query, exact, signal) =>
      source.fetchCount(fetch(query), exact, signal),
    fetchTotals: (query, signal) => source.fetchTotals(fetch(query), signal),
    fetchFacets: (query, signal) => source.fetchFacets(fetch(query), signal),
    fetchGroups: (query, signal) => source.fetchGroups(fetch(query), signal),
    fetchNarrowed: (query, signal) =>
      source.fetchNarrowed(fetch(query), signal),
    fetchExport: (query, request, signal) =>
      source.fetchExport(fetch(query), request, signal),
  };
}
