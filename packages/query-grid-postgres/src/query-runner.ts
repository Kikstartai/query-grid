import type { GridRow, QueryState } from "@kikstart/query-grid";
import {
  COUNT_CAP,
  QUICK_LIMIT,
  type CountResult,
  type FacetCount,
  type PageResult,
  type TotalResult,
} from "@kikstart/query-grid/http";

import { isFacetOnlyQuery } from "./shapes.ts";
import {
  assertDeclared,
  buildCappedCountSql,
  buildCappedTotalSql,
  buildExactCountSql,
  buildFacetSql,
  buildPageSql,
  QueryRejected,
  toPageResult,
  type SqlQuery,
} from "./sql-builder.ts";
import type { ServerGridDef } from "./storage.ts";

export const QUICK_BUDGET_MS = 120;
export const QUICK_SETTINGS = [
  "enable_seqscan = off",
  `statement_timeout = ${QUICK_BUDGET_MS}`,
];
export const TOTAL_SETTINGS = ["enable_sort = off"];
export const QUERY_CANCELED = "57014";

const EXACT_COUNT_SETTINGS = ["statement_timeout = '60s'"];
const WALK_PAGE_SIZE = 1000;

export type SqlExecutor = <T extends object>(
  sql: SqlQuery,
  settings?: string[],
) => Promise<T[]>;

function resolveCap(query: QueryState): number {
  return query.quick !== null ? QUICK_LIMIT : COUNT_CAP;
}

async function runFiltered<T extends object>(
  execute: SqlExecutor,
  query: QueryState,
  sql: SqlQuery,
  settings?: string[],
): Promise<T[]> {
  if (query.quick === null) {
    return execute<T>(sql, settings);
  }
  try {
    return await execute<T>(sql, QUICK_SETTINGS);
  } catch (error) {
    if ((error as { code?: string }).code === QUERY_CANCELED) {
      throw new QueryRejected("too_broad");
    }
    throw error;
  }
}

export async function listGridPage(
  def: ServerGridDef,
  execute: SqlExecutor,
  query: QueryState,
  limit: number,
): Promise<PageResult> {
  const rows = await runFiltered<GridRow>(
    execute,
    query,
    buildPageSql(def, query, limit),
  );
  return toPageResult(def, query, rows, limit);
}

export async function* walkGridPages(
  def: ServerGridDef,
  execute: SqlExecutor,
  query: QueryState,
  pageSize: number = WALK_PAGE_SIZE,
): AsyncGenerator<GridRow[]> {
  let cursor: string | null = query.cursor;
  do {
    const page = await listGridPage(
      def,
      execute,
      { ...query, cursor },
      pageSize,
    );
    yield page.rows;
    cursor = page.nextCursor;
  } while (cursor !== null);
}

export async function listFacetCounts(
  def: ServerGridDef,
  execute: SqlExecutor,
): Promise<FacetCount[]> {
  const sql = buildFacetSql(def);
  return sql ? execute<FacetCount>(sql) : [];
}

async function listSelectedCounters(
  def: ServerGridDef,
  execute: SqlExecutor,
  query: QueryState,
): Promise<FacetCount[]> {
  const counts = await listFacetCounts(def, execute);
  const selected = def.facet ? query.equals[def.facet.field] : undefined;
  return selected
    ? counts.filter((facet) => selected.includes(facet.value))
    : counts;
}

export async function getGridCount(
  def: ServerGridDef,
  execute: SqlExecutor,
  query: QueryState,
  exact: boolean,
): Promise<CountResult> {
  assertDeclared(def, query);
  if (isFacetOnlyQuery(def.facet?.field, query)) {
    const counters = await listSelectedCounters(def, execute, query);
    return {
      count: counters.reduce((sum, facet) => sum + facet.count, 0),
      capped: false,
      source: "counter",
    };
  }
  if (exact) {
    const [row] = await runFiltered<{ count: number }>(
      execute,
      query,
      buildExactCountSql(def, query),
      EXACT_COUNT_SETTINGS,
    );
    return { count: row.count, capped: false, source: "exact" };
  }
  const cap = resolveCap(query);
  const [row] = await runFiltered<{ count: number }>(
    execute,
    query,
    buildCappedCountSql(def, query, cap),
  );
  return {
    count: Math.min(row.count, cap),
    capped: row.count > cap,
    source: "capped",
  };
}

export async function getGridTotal(
  def: ServerGridDef,
  execute: SqlExecutor,
  query: QueryState,
): Promise<TotalResult> {
  assertDeclared(def, query);
  if (!def.total) {
    return { available: false, code: "no_total", params: {} };
  }
  if (isFacetOnlyQuery(def.facet?.field, query)) {
    const counters = await listSelectedCounters(def, execute, query);
    return {
      available: true,
      sum: counters.reduce((sum, facet) => sum + (facet.sum ?? 0), 0),
      rows: counters.reduce((sum, facet) => sum + facet.count, 0),
      source: "counter",
    };
  }
  const cap = resolveCap(query);
  const [row] = await runFiltered<{ count: number; sum: number }>(
    execute,
    query,
    buildCappedTotalSql(def, query, cap),
    TOTAL_SETTINGS,
  );
  if (row.count > cap) {
    return { available: false, code: "over_cap", params: { cap } };
  }
  return { available: true, sum: row.sum, rows: row.count, source: "live" };
}
