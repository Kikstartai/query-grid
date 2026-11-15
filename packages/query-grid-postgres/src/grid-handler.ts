import {
  decodeQuery,
  formatProblem,
  isValidFieldValue,
  KEY_FIELD,
  resolveLimits,
  type FieldOption,
  type GridLimits,
  type GridRow,
  type OptionSearch,
  type ProblemParams,
} from "@kikstart/query-grid";
import {
  EXACT_PARAM,
  LIMIT_PARAM,
  SUB_ROUTES,
  type ErrorBody,
  type MoveBody,
  type SubRoute,
} from "@kikstart/query-grid/http";

import {
  getGridCount,
  getNarrowedSizes,
  listFacetCounts,
  listGridPage,
  listGridTotals,
  QUERY_CANCELED,
  type SqlExecutor,
} from "./query-runner.ts";
import { QueryRejected } from "./sql-builder.ts";
import type { PostgresGridDef } from "./storage.ts";

type Route = "page" | SubRoute;

function isAbortError(error: unknown, signal: AbortSignal): boolean {
  const { name, code } = (error ?? {}) as { name?: string; code?: string };
  return (
    error === signal.reason || name === "AbortError" || code === QUERY_CANCELED
  );
}

const LIMIT = /^\d{1,9}$/;
const CLIENT_CLOSED_REQUEST = 499;

export interface GridMoves {
  transitions: (signal: AbortSignal) => Promise<[string, string][]>;
  change: (id: string, to: string) => Promise<GridRow>;
}

export interface GridHandlerConfig {
  def: PostgresGridDef;
  execute: SqlExecutor;
  basePath?: string;
  limits?: Partial<GridLimits>;
  options?: (
    field: string,
    search: OptionSearch,
    signal: AbortSignal,
  ) => Promise<FieldOption[]>;
  moves?: GridMoves;
  onError?: (error: unknown) => void;
}

export type GridHandler = (request: Request) => Promise<Response>;

function resolveRoute(pathname: string, basePath?: string): Route | null {
  const path = pathname.replace(/\/+$/, "");
  if (basePath === undefined) {
    const last = path.slice(path.lastIndexOf("/") + 1);
    return SUB_ROUTES.find((route) => route === last) ?? "page";
  }
  const base = basePath.replace(/\/+$/, "");
  if (path === base) {
    return "page";
  }
  if (!path.startsWith(`${base}/`)) {
    return null;
  }
  const rest = path.slice(base.length + 1);
  return SUB_ROUTES.find((route) => route === rest) ?? null;
}

function readLimit(raw: string | null, limits: GridLimits): number {
  if (raw === null) {
    return limits.pageLimit;
  }
  if (!LIMIT.test(raw) || Number(raw) < 1) {
    throw new QueryRejected("invalid_limit");
  }
  return Number(raw);
}

function errorResponse(
  status: number,
  error: string,
  code: string = error,
  params: ProblemParams = {},
): Response {
  const body: ErrorBody = {
    error,
    message: formatProblem(code, params),
    code,
    params,
  };
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function resolveStatus(error: QueryRejected): number {
  if (error.error === "transition_refused") {
    return 409;
  }
  return error.error === "not_found" ? 404 : 400;
}

async function readMove(
  def: PostgresGridDef,
  request: Request,
): Promise<MoveBody> {
  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    to?: unknown;
  } | null;
  const id = body?.id;
  const to = body?.to;
  if (typeof id !== "string" || !isValidFieldValue(def, KEY_FIELD, id)) {
    throw new QueryRejected("invalid_value", "invalid_value", {
      field: KEY_FIELD,
    });
  }
  const facet = def.facet?.field;
  if (
    typeof to !== "string" ||
    (facet !== undefined && !isValidFieldValue(def, facet, to))
  ) {
    throw new QueryRejected("invalid_value", "invalid_value", {
      field: facet ?? "to",
    });
  }
  return { id, to };
}

export function createGridHandler(config: GridHandlerConfig): GridHandler {
  const { def, execute } = config;
  const limits = resolveLimits(config.limits);
  const report = config.onError ?? ((error: unknown) => console.error(error));

  const answer = async (route: Route, request: Request): Promise<unknown> => {
    const params = new URL(request.url).searchParams;
    const { signal } = request;
    switch (route) {
      case "page":
        return listGridPage(
          def,
          execute,
          decodeQuery(def, params),
          readLimit(params.get(LIMIT_PARAM), limits),
          signal,
          limits,
        );
      case "count":
        return getGridCount(
          def,
          execute,
          decodeQuery(def, params),
          params.get(EXACT_PARAM) === "1",
          signal,
          limits,
        );
      case "total":
        return listGridTotals(
          def,
          execute,
          decodeQuery(def, params),
          signal,
          limits,
        );
      case "facets":
        return listFacetCounts(def, execute, signal);
      case "options":
        if (!config.options) {
          throw new QueryRejected("not_found");
        }
        return config.options(
          params.get("field") ?? "",
          {
            query: params.get("query") ?? undefined,
            value: params.get("value") ?? undefined,
          },
          signal,
        );
      case "narrowed":
        return getNarrowedSizes(
          def,
          execute,
          decodeQuery(def, params),
          signal,
          limits,
        );
      case "limits":
        return limits;
      case "transitions":
        if (!config.moves) {
          throw new QueryRejected("not_found");
        }
        return config.moves.transitions(signal);
      case "status": {
        if (!config.moves) {
          throw new QueryRejected("not_found");
        }
        const move = await readMove(def, request);
        return config.moves.change(move.id, move.to);
      }
    }
  };

  return async (request) => {
    const route = resolveRoute(new URL(request.url).pathname, config.basePath);
    if (route === null) {
      return errorResponse(404, "not_found");
    }
    if (request.method !== (route === "status" ? "POST" : "GET")) {
      return errorResponse(405, "method_not_allowed");
    }
    const started = performance.now();
    try {
      const body = await answer(route, request);
      return Response.json(body, {
        headers: {
          "server-timing": `db;dur=${(performance.now() - started).toFixed(1)}`,
          "cache-control": "no-store",
        },
      });
    } catch (error) {
      if (request.signal.aborted) {
        if (!isAbortError(error, request.signal)) {
          report(error);
        }
        return new Response(null, { status: CLIENT_CLOSED_REQUEST });
      }
      if (error instanceof QueryRejected) {
        return errorResponse(
          resolveStatus(error),
          error.error,
          error.code,
          error.params,
        );
      }
      report(error);
      return errorResponse(500, "internal");
    }
  };
}
