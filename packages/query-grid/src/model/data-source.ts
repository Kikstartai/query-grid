import type {
  FieldOption,
  GridDef,
  GridRow,
  QueryMode,
  QueryState,
} from "./field-types.ts";
import { encodeQuery } from "./query-url.ts";
import type {
  CountResult,
  FacetCount,
  PageResult,
  TotalResult,
} from "./wire-types.ts";

export interface OptionSearch {
  query?: string;
  value?: string;
}

export interface DataSource {
  mode: QueryMode;
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
  fetchTotal: (query: QueryState, signal: AbortSignal) => Promise<TotalResult>;
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

async function readJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? `request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export function createHttpSource(def: GridDef, basePath: string): DataSource {
  const filterParams = (query: QueryState) =>
    encodeQuery(def, { ...query, cursor: null });
  return {
    mode: "indexed",
    fetchPage: (query, limit, signal) => {
      const params = encodeQuery(def, query);
      params.set("limit", String(limit));
      return readJson<PageResult>(`${basePath}?${params}`, { signal });
    },
    fetchCount: (query, exact, signal) => {
      const params = filterParams(query);
      if (exact) {
        params.set("exact", "1");
      }
      return readJson<CountResult>(`${basePath}/count?${params}`, { signal });
    },
    fetchTotal: (query, signal) =>
      readJson<TotalResult>(`${basePath}/total?${filterParams(query)}`, {
        signal,
      }),
    fetchFacets: (_query, signal) =>
      readJson<FacetCount[]>(`${basePath}/facets`, { signal }),
    fetchOptions: (field, search, signal) => {
      const params = new URLSearchParams({ field });
      if (search.query) {
        params.set("query", search.query);
      }
      if (search.value) {
        params.set("value", search.value);
      }
      return readJson<FieldOption[]>(`${basePath}/options?${params}`, {
        signal,
      });
    },
    fetchTransitions: (signal) =>
      readJson<[string, string][]>(`${basePath}/transitions`, { signal }),
    changeFacetValue: (id, to) =>
      readJson<GridRow>(`${basePath}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, to }),
      }),
  };
}
