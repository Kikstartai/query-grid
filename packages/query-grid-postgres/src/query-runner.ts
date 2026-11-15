import {
  COUNT_CAP,
  isFacetOnlyQuery,
  QUICK_LIMIT,
  type CountResult,
  type FacetCount,
  type GridRow,
  type PageResult,
  type QueryState,
  type TotalResult,
} from "@kikstart/query-grid";

import {
  assertDeclared,
  buildCappedCountSql,
  buildCappedTotalSql,
  buildExactCountSql,
  buildFacetSql,
  buildPageSql,
  QueryRejected,
  sumColumn,
  toPageResult,
  type SqlQuery,
} from "./sql-builder.ts";
import type { PostgresGridDef } from "./storage.ts";

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
  signal?: AbortSignal,
) => Promise<T[]>;

function resolveCap(query: QueryState): number {
  return query.quick !== null ? QUICK_LIMIT : COUNT_CAP;
}

async function runFiltered<T extends object>(
  execute: SqlExecutor,
  query: QueryState,
  sql: SqlQuery,
  settings?: string[],
  signal?: AbortSignal,
): Promise<T[]> {
  if (query.quick === null) {
    return execute<T>(sql, settings, signal);
  }
  try {
    return await execute<T>(sql, QUICK_SETTINGS, signal);
  } catch (error) {
    const canceled = (error as { code?: string }).code === QUERY_CANCELED;
    if (canceled && !signal?.aborted) {
      throw new QueryRejected("too_broad");
    }
    throw error;
  }
}

export async function listGridPage(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  limit: number,
  signal?: AbortSignal,
): Promise<PageResult> {
  const rows = await runFiltered<GridRow>(
    execute,
    query,
    buildPageSql(def, query, limit),
    undefined,
    signal,
  );
  return toPageResult(def, query, rows, limit);
}

export async function* walkGridPages(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  pageSize: number = WALK_PAGE_SIZE,
  signal?: AbortSignal,
): AsyncGenerator<GridRow[]> {
  let cursor: string | null = query.cursor;
  do {
    signal?.throwIfAborted();
    const page = await listGridPage(
      def,
      execute,
      { ...query, cursor },
      pageSize,
      signal,
    );
    yield page.rows;
    cursor = page.nextCursor;
  } while (cursor !== null);
}

type CounterRow = Record<string, string | number> & {
  value: string;
  count: number;
};

export async function listFacetCounts(
  def: PostgresGridDef,
  execute: SqlExecutor,
  signal?: AbortSignal,
): Promise<FacetCount[]> {
  const sql = buildFacetSql(def);
  if (!sql) {
    return [];
  }
  const totals = def.totals ?? [];
  const rows = await execute<CounterRow>(sql, undefined, signal);
  return rows.map((row) => ({
    value: row.value,
    count: row.count,
    sums: Object.fromEntries(
      totals.map((field) => [field, Number(row[sumColumn(field)])]),
    ),
  }));
}

async function listSelectedCounters(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  signal?: AbortSignal,
): Promise<FacetCount[]> {
  const counts = await listFacetCounts(def, execute, signal);
  const selected = def.facet ? query.equals[def.facet.field] : undefined;
  return selected
    ? counts.filter((facet) => selected.includes(facet.value))
    : counts;
}

export async function getGridCount(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  exact: boolean,
  signal?: AbortSignal,
): Promise<CountResult> {
  assertDeclared(def, query);
  if (isFacetOnlyQuery(def.facet?.field, query)) {
    const counters = await listSelectedCounters(def, execute, query, signal);
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
      signal,
    );
    return { count: row.count, capped: false, source: "exact" };
  }
  const cap = resolveCap(query);
  const [row] = await runFiltered<{ count: number }>(
    execute,
    query,
    buildCappedCountSql(def, query, cap),
    undefined,
    signal,
  );
  return {
    count: Math.min(row.count, cap),
    capped: row.count > cap,
    source: "capped",
  };
}

export async function listGridTotals(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  signal?: AbortSignal,
): Promise<TotalResult[]> {
  assertDeclared(def, query);
  const totals = def.totals ?? [];
  if (totals.length === 0) {
    return [];
  }
  if (isFacetOnlyQuery(def.facet?.field, query)) {
    const counters = await listSelectedCounters(def, execute, query, signal);
    const rows = counters.reduce((sum, facet) => sum + facet.count, 0);
    return totals.map((field) => ({
      field,
      available: true,
      sum: counters.reduce((sum, facet) => sum + (facet.sums?.[field] ?? 0), 0),
      rows,
      source: "counter",
    }));
  }
  const cap = resolveCap(query);
  const [row] = await runFiltered<Record<string, number>>(
    execute,
    query,
    buildCappedTotalSql(def, query, cap),
    TOTAL_SETTINGS,
    signal,
  );
  if (row.count > cap) {
    return totals.map((field) => ({
      field,
      available: false,
      code: "over_cap",
      params: { cap },
    }));
  }
  return totals.map((field) => ({
    field,
    available: true,
    sum: row[sumColumn(field)],
    rows: row.count,
    source: "live",
  }));
}
