import type { DataSource } from "./data-source.ts";
import type { FieldOption, GridRow, QueryState } from "./field-types.ts";
import { SourceError, type Problem } from "./problems.ts";
import { encodeQuery } from "./query-url.ts";
import { gridDefCapabilities, type ShapedGridDef } from "./shapes.ts";
import type {
  CountResult,
  FacetCount,
  PageResult,
  TotalResult,
} from "./wire-types.ts";

export const SUB_ROUTES = [
  "count",
  "total",
  "facets",
  "options",
  "transitions",
  "status",
] as const;

export type SubRoute = (typeof SUB_ROUTES)[number];

export const LIMIT_PARAM = "limit";
export const EXACT_PARAM = "exact";

export interface ErrorBody extends Problem {
  error: string;
  message: string;
}

export interface MoveBody {
  id: string;
  to: string;
}

async function readJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => null)) as Partial<ErrorBody> | null;
    if (!body?.code) {
      throw new SourceError("request_failed", { status: response.status });
    }
    throw new SourceError(body.code, body.params ?? {});
  }
  return (await response.json()) as T;
}

export function createHttpSource(
  def: ShapedGridDef,
  basePath: string,
): DataSource {
  const capabilities = gridDefCapabilities(def);
  const filterParams = (query: QueryState) =>
    encodeQuery(def, { ...query, cursor: null });
  const route = (name: SubRoute) => `${basePath}/${name}`;
  return {
    capabilities,
    fetchPage: (query, limit, signal) => {
      const params = encodeQuery(def, query);
      params.set(LIMIT_PARAM, String(limit));
      return readJson<PageResult>(`${basePath}?${params}`, { signal });
    },
    fetchCount: (query, exact, signal) => {
      const params = filterParams(query);
      if (exact) {
        params.set(EXACT_PARAM, "1");
      }
      return readJson<CountResult>(`${route("count")}?${params}`, { signal });
    },
    fetchTotal: (query, signal) =>
      readJson<TotalResult>(`${route("total")}?${filterParams(query)}`, {
        signal,
      }),
    fetchFacets: (_query, signal) =>
      readJson<FacetCount[]>(route("facets"), { signal }),
    fetchOptions: (field, search, signal) => {
      const params = new URLSearchParams({ field });
      if (search.query) {
        params.set("query", search.query);
      }
      if (search.value) {
        params.set("value", search.value);
      }
      return readJson<FieldOption[]>(`${route("options")}?${params}`, {
        signal,
      });
    },
    fetchTransitions: (signal) =>
      readJson<[string, string][]>(route("transitions"), { signal }),
    changeFacetValue: (id, to) => {
      const body: MoveBody = { id, to };
      return readJson<GridRow>(route("status"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    },
  };
}
