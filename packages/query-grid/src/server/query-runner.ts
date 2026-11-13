import type { GridDef, GridRow, QueryState } from "../model/field-types.ts";
import { formatCount } from "../model/format.ts";
import { isFacetOnlyQuery } from "../model/shapes.ts";
import {
  COUNT_CAP,
  QUICK_LIMIT,
  type CountResult,
  type FacetCount,
  type PageResult,
  type TotalResult,
} from "../model/wire-types.ts";
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

export const QUICK_BUDGET_MS = 120;
export const QUICK_SETTINGS = [
  "enable_seqscan = off",
  `statement_timeout = ${QUICK_BUDGET_MS}`,
];
export const QUERY_CANCELED = "57014";

const EXACT_COUNT_SETTINGS = ["statement_timeout = '60s'"];
const WALK_PAGE_SIZE = 1000;

export type SqlExecutor = <T extends object>(
  sql: SqlQuery,
  settings?: string[],
) => Promise<T[]>;

async function runFiltered<T extends object>(
  execute: SqlExecutor,
  query: QueryState,
  sql: SqlQuery,
): Promise<T[]> {
  if (query.quick === null) {
    return execute<T>(sql);
  }
  try {
    return await execute<T>(sql, QUICK_SETTINGS);
  } catch (error) {
    if ((error as { code?: string }).code === QUERY_CANCELED) {
      throw new QueryRejected(
        "too_broad",
        "That quick filter matches too much to answer fast. Add more characters.",
      );
    }
    throw error;
  }
}

export async function listGridPage(
  def: GridDef,
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
  def: GridDef,
  execute: SqlExecutor,
  query: QueryState,
  pageSize: number = WALK_PAGE_SIZE,
): AsyncGenerator<GridRow[]> {
  let cursor: string | null = query.cursor;
  do {
    const page = await listGridPage(def, execute, { ...query, cursor }, pageSize);
    yield page.rows;
    cursor = page.nextCursor;
  } while (cursor !== null);
}

export async function listFacetCounts(
  def: GridDef,
  execute: SqlExecutor,
): Promise<FacetCount[]> {
  const sql = buildFacetSql(def);
  return sql ? execute<FacetCount>(sql) : [];
}

async function listSelectedCounters(
  def: GridDef,
  execute: SqlExecutor,
  query: QueryState,
): Promise<FacetCount[]> {
  const counts = await listFacetCounts(def, execute);
  const selected = def.facet ? query.equals[def.facet.field] : undefined;
  return selected
    ? counts.filter((facet) => facet.value === selected)
    : counts;
}

export async function getGridCount(
  def: GridDef,
  execute: SqlExecutor,
  query: QueryState,
  exact: boolean,
): Promise<CountResult> {
  assertDeclared(def, query);
  if (isFacetOnlyQuery(def, query)) {
    const counters = await listSelectedCounters(def, execute, query);
    return {
      count: counters.reduce((sum, facet) => sum + facet.count, 0),
      capped: false,
      source: "counter",
    };
  }
  if (exact) {
    const [row] = await execute<{ count: number }>(
      buildExactCountSql(def, query),
      EXACT_COUNT_SETTINGS,
    );
    return { count: row.count, capped: false, source: "exact" };
  }
  const cap = query.quick !== null ? QUICK_LIMIT : COUNT_CAP;
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
  def: GridDef,
  execute: SqlExecutor,
  query: QueryState,
): Promise<TotalResult> {
  assertDeclared(def, query);
  if (!def.total) {
    return { available: false, reason: "This grid declares no total." };
  }
  if (isFacetOnlyQuery(def, query)) {
    const counters = await listSelectedCounters(def, execute, query);
    return {
      available: true,
      sum: counters.reduce((sum, facet) => sum + (facet.sum ?? 0), 0),
      rows: counters.reduce((sum, facet) => sum + facet.count, 0),
      source: "counter",
    };
  }
  const cap = query.quick !== null ? QUICK_LIMIT : COUNT_CAP;
  const sql = buildCappedTotalSql(def, query, cap) as SqlQuery;
  const [row] = await runFiltered<{ count: number; sum: number }>(
    execute,
    query,
    sql,
  );
  if (row.count > cap) {
    return {
      available: false,
      reason: `More than ${formatCount(cap, def.format)} rows match and no counter totals this filter.`,
    };
  }
  return { available: true, sum: row.sum, rows: row.count, source: "live" };
}
