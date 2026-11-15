import {
  countFilterTerms,
  DEFAULT_LIMITS,
  isFacetOnlyQuery,
  isMatchAny,
  planQuery,
  type CountResult,
  type FacetCount,
  type GridLimits,
  type GridRow,
  type NarrowedResult,
  type PageResult,
  type QueryPlan,
  type QueryState,
  type SizeResult,
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

export function listSearchSettings(
  limits: GridLimits = DEFAULT_LIMITS,
): string[] {
  return [
    "enable_seqscan = off",
    `statement_timeout = ${limits.searchBudgetMs}`,
  ];
}
export const TOTAL_SETTINGS = ["enable_sort = off"];
export const NARROW_SETTINGS = ["enable_seqscan = off"];
export const QUERY_CANCELED = "57014";

const EXACT_COUNT_SETTINGS = ["statement_timeout = '60s'"];
const WALK_PAGE_SIZE = 1000;

export type SqlExecutor = <T extends object>(
  sql: SqlQuery,
  settings?: string[],
  signal?: AbortSignal,
) => Promise<T[]>;

function resolveCap(query: QueryState, limits: GridLimits): number {
  return query.search !== null ? limits.searchLimit : limits.countCap;
}

async function runFiltered<T extends object>(
  execute: SqlExecutor,
  query: QueryState,
  sql: SqlQuery,
  limits: GridLimits,
  settings?: string[],
  signal?: AbortSignal,
): Promise<T[]> {
  if (query.search === null) {
    return execute<T>(sql, settings?.length ? settings : undefined, signal);
  }
  try {
    return await execute<T>(sql, listSearchSettings(limits), signal);
  } catch (error) {
    const canceled = (error as { code?: string }).code === QUERY_CANCELED;
    if (canceled && !signal?.aborted) {
      throw new QueryRejected("too_broad");
    }
    throw error;
  }
}

async function sizeOf(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  limit: number,
  signal?: AbortSignal,
): Promise<SizeResult> {
  if (isFacetOnlyQuery(def.facet?.field, query)) {
    const counters = await listSelectedCounters(def, execute, query, signal);
    const rows = counters.reduce((sum, facet) => sum + facet.count, 0);
    return { rows, over: rows > limit };
  }
  const [row] = await execute<{ count: number }>(
    buildCappedCountSql(def, query, limit),
    undefined,
    signal,
  );
  return { rows: Math.min(row.count, limit), over: row.count > limit };
}

function wholeTable(def: PostgresGridDef, query: QueryState): QueryState {
  return {
    ...query,
    equals: {},
    ranges: [],
    contains: null,
    match: "all",
    search: null,
    sort: def.defaultSort,
    cursor: null,
  };
}

async function sizeOfAny(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  plan: QueryPlan,
  limit: number,
  signal?: AbortSignal,
): Promise<SizeResult> {
  if (!plan.terms) {
    return sizeOf(def, execute, wholeTable(def, query), limit, signal);
  }
  const sizes = await Promise.all(
    plan.terms.map((term) => sizeOf(def, execute, term, limit, signal)),
  );
  const rows = sizes.reduce((sum, size) => sum + size.rows, 0);
  return { rows, over: rows > limit || sizes.some((size) => size.over) };
}

function sizeOfPlan(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  plan: QueryPlan,
  limit: number,
  signal?: AbortSignal,
): Promise<SizeResult> {
  return isMatchAny(query)
    ? sizeOfAny(def, execute, query, plan, limit, signal)
    : sizeOf(def, execute, plan.core, limit, signal);
}

export async function getNarrowedSizes(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  signal?: AbortSignal,
  limits: GridLimits = DEFAULT_LIMITS,
): Promise<NarrowedResult> {
  assertDeclared(def, query);
  const limit = limits.narrowLimit;
  const filters: QueryState = { ...query, search: null, cursor: null };
  const all = planQuery(def.indexes, { ...filters, match: "all" });
  const any =
    countFilterTerms(filters) > 1
      ? planQuery(def.indexes, { ...filters, match: "any" })
      : null;
  const [allSize, anySize] = await Promise.all([
    sizeOf(def, execute, all?.core ?? wholeTable(def, filters), limit, signal),
    any
      ? sizeOfAny(
          def,
          execute,
          { ...filters, match: "any" },
          any,
          limit,
          signal,
        )
      : null,
  ]);
  return { limit, all: allSize, any: anySize };
}

async function listNarrowSettings(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  limits: GridLimits,
  signal?: AbortSignal,
): Promise<string[]> {
  assertDeclared(def, query);
  const plan = planQuery(def.indexes, query);
  if (!plan?.narrowed) {
    return [];
  }
  const limit = limits.narrowLimit;
  const size = await sizeOfPlan(def, execute, query, plan, limit, signal);
  if (size.over) {
    throw new QueryRejected("narrow_first", "narrow_first", {
      rows: size.rows,
      limit,
    });
  }
  return NARROW_SETTINGS;
}

export async function listGridPage(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  limit: number,
  signal?: AbortSignal,
  limits: GridLimits = DEFAULT_LIMITS,
): Promise<PageResult> {
  const narrow = await listNarrowSettings(def, execute, query, limits, signal);
  const rows = await runFiltered<GridRow>(
    execute,
    query,
    buildPageSql(def, query, limit, limits),
    limits,
    narrow,
    signal,
  );
  return toPageResult(def, query, rows, limit, limits);
}

export async function* walkGridPages(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  pageSize: number = WALK_PAGE_SIZE,
  signal?: AbortSignal,
  limits: GridLimits = DEFAULT_LIMITS,
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
      limits,
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
  const columns = (def.totals ?? []).map((field): [string, string] => [
    field,
    sumColumn(field),
  ]);
  const rows = await execute<CounterRow>(sql, undefined, signal);
  return rows.map((row) => ({
    value: row.value,
    count: row.count,
    sums: Object.fromEntries(
      columns.map(([field, column]) => [field, Number(row[column])]),
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
  limits: GridLimits = DEFAULT_LIMITS,
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
  const narrow = await listNarrowSettings(def, execute, query, limits, signal);
  if (exact) {
    const [row] = await runFiltered<{ count: number }>(
      execute,
      query,
      buildExactCountSql(def, query),
      limits,
      [...EXACT_COUNT_SETTINGS, ...narrow],
      signal,
    );
    return { count: row.count, capped: false, source: "exact" };
  }
  const cap = resolveCap(query, limits);
  const [row] = await runFiltered<{ count: number }>(
    execute,
    query,
    buildCappedCountSql(def, query, cap),
    limits,
    narrow,
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
  limits: GridLimits = DEFAULT_LIMITS,
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
  const cap = resolveCap(query, limits);
  const narrow = await listNarrowSettings(def, execute, query, limits, signal);
  const [row] = await runFiltered<Record<string, number>>(
    execute,
    query,
    buildCappedTotalSql(def, query, cap),
    limits,
    [...TOTAL_SETTINGS, ...narrow],
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
