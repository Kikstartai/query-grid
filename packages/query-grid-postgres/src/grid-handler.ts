import {
  decodeQuery,
  formatProblem,
  isValidFieldValue,
  KEY_FIELD,
  type FieldOption,
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
  getGridTotal,
  listFacetCounts,
  listGridPage,
  type SqlExecutor,
} from "./query-runner.ts";
import { DEFAULT_PAGE_LIMIT, QueryRejected } from "./sql-builder.ts";
import type { ServerGridDef } from "./storage.ts";

type Route = "page" | SubRoute;

const LIMIT = /^\d{1,9}$/;
const CLIENT_CLOSED_REQUEST = 499;

export interface GridMoves {
  transitions: (signal: AbortSignal) => Promise<[string, string][]>;
  change: (id: string, to: string) => Promise<GridRow>;
}

export interface GridHandlerConfig {
  def: ServerGridDef;
  execute: SqlExecutor;
  basePath?: string;
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

function readLimit(raw: string | null): number {
  if (raw === null) {
    return DEFAULT_PAGE_LIMIT;
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
  def: ServerGridDef,
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
          readLimit(params.get(LIMIT_PARAM)),
          signal,
        );
      case "count":
        return getGridCount(
          def,
          execute,
          decodeQuery(def, params),
          params.get(EXACT_PARAM) === "1",
          signal,
        );
      case "total":
        return getGridTotal(def, execute, decodeQuery(def, params), signal);
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
