import type {
  RunnableQueries,
  FieldOption,
  GridRow,
  QueryState,
} from "./field-types.ts";
import type {
  CountResult,
  FacetCount,
  OptionSearch,
  PageResult,
  TotalResult,
} from "./wire-types.ts";

export interface DataSource {
  runnable: RunnableQueries;
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
  fetchTransitions: (signal: AbortSignal) => Promise<[string, string][]>;
  changeFacetValue: (id: string, to: string) => Promise<GridRow>;
}
