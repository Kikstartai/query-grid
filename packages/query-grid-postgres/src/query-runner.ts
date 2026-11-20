import {
  BLANK_GROUP,
  DEFAULT_LIMITS,
  getField,
  GROUP_LIMIT,
  matchesFilter,
  toGroupFilter,
  toGroupValue,
  isFacetOnlyQuery,
  isCombineOr,
  isQueryBudgeted,
  planQuery,
  withoutFilters,
  type BaseFieldDef,
  type CountResult,
  type Filter,
  type FacetCount,
  type GridLimits,
  type GridRow,
  type GroupHeader,
  type GroupsResult,
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
  buildGroupSql,
  buildPageSql,
  isTotalOrdered,
  QueryRejected,
  sumColumn,
  toPageResult,
  type SqlQuery,
} from "./sql-builder.ts";
import type { PostgresGridDef } from "./storage.ts";

const TIMEOUT = "statement_timeout";

export function listSearchSettings(
  limits: GridLimits = DEFAULT_LIMITS,
): string[] {
  return ["enable_seqscan = off", `${TIMEOUT} = ${limits.searchBudgetMs}`];
}
export const TOTAL_SETTINGS = ["enable_sort = off"];
export const NARROW_SETTINGS = ["enable_seqscan = off"];
export const QUERY_CANCELED = "57014";

const EXACT_COUNT_SETTINGS = [`${TIMEOUT} = '60s'`];
const WALK_PAGE_SIZE = 1000;

export type SqlExecutor = <T extends object>(
  sql: SqlQuery,
  settings?: string[],
  signal?: AbortSignal,
) => Promise<T[]>;

function resolveCap(query: QueryState, limits: GridLimits): number {
  return query.search !== null ? limits.searchLimit : limits.countCap;
}

// A budgeted query runs under the search's time budget, in place of any other timeout, and is refused past it.
async function runFiltered<T extends object>(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  sql: SqlQuery,
  limits: GridLimits,
  settings: string[] = [],
  signal?: AbortSignal,
): Promise<T[]> {
  if (!isQueryBudgeted(def, query)) {
    return execute<T>(sql, settings.length ? settings : undefined, signal);
  }
  const kept = settings.filter((setting) => !setting.startsWith(TIMEOUT));
  const budgeted = [...new Set([...kept, ...listSearchSettings(limits)])];
  try {
    return await execute<T>(sql, budgeted, signal);
  } catch (error) {
    const canceled = (error as { code?: string }).code === QUERY_CANCELED;
    if (canceled && !signal?.aborted) {
      throw new QueryRejected("too_broad");
    }
    throw error;
  }
}

function sumCounts(counters: FacetCount[]): number {
  return counters.reduce((sum, facet) => sum + facet.count, 0);
}

function readSums(
  def: PostgresGridDef,
  row: Record<string, string | number | null>,
): Record<string, number> {
  return Object.fromEntries(
    (def.totals ?? []).map((field) => [field, Number(row[sumColumn(field)])]),
  );
}

function assertUnderLimit(size: SizeResult, limit: number): void {
  if (size.over) {
    throw new QueryRejected("narrow_first", "narrow_first", {
      rows: size.rows,
      limit,
    });
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
    const rows = sumCounts(counters);
    return { rows, over: rows > limit, capped: false };
  }
  const [row] = await execute<{ count: number }>(
    buildCappedCountSql(def, query, limit),
    undefined,
    signal,
  );
  const over = row.count > limit;
  return { rows: Math.min(row.count, limit), over, capped: over };
}

function wholeTable(def: PostgresGridDef, query: QueryState): QueryState {
  return {
    ...withoutFilters(query),
    search: null,
    sort: def.defaultSort,
    thenBy: undefined,
  };
}

// A size is of the rows the ordered indexes leave, so it is planned with no text or array index and never counted through one.
function planOrdered(
  def: PostgresGridDef,
  query: QueryState,
): QueryPlan | null {
  return planQuery(def, query, true);
}

async function sizeOfOr(
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
  return {
    rows,
    over: rows > limit || sizes.some((size) => size.over),
    capped: sizes.some((size) => size.capped),
  };
}

function sizeOfPlan(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  plan: QueryPlan,
  limit: number,
  signal?: AbortSignal,
): Promise<SizeResult> {
  return isCombineOr(query)
    ? sizeOfOr(def, execute, query, plan, limit, signal)
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
  const filters: QueryState = {
    ...query,
    search: null,
    group: null,
    cursor: null,
  };
  const andPlan = planOrdered(def, { ...filters, combine: "and" });
  const orPlan =
    filters.filters.length > 1
      ? planOrdered(def, { ...filters, combine: "or" })
      : null;
  const [andSize, orSize] = await Promise.all([
    sizeOf(
      def,
      execute,
      andPlan?.core ?? wholeTable(def, filters),
      limit,
      signal,
    ),
    orPlan
      ? sizeOfOr(
          def,
          execute,
          { ...filters, combine: "or" },
          orPlan,
          limit,
          signal,
        )
      : null,
  ]);
  return { limit, and: andSize, or: orSize };
}

async function listNarrowSettings(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  limits: GridLimits,
  signal?: AbortSignal,
): Promise<string[]> {
  assertDeclared(def, query);
  const plan = planQuery(def, query);
  if (!plan?.narrowed) {
    return [];
  }
  const limit = limits.narrowLimit;
  assertUnderLimit(
    await sizeOfPlan(def, execute, query, plan, limit, signal),
    limit,
  );
  return NARROW_SETTINGS;
}

function listFacetGroupValues(
  field: BaseFieldDef | null,
  selected: Filter[],
): string[] {
  const options = (field?.options ?? []).map((option) => option.value);
  const values = field?.nullable ? [...options, BLANK_GROUP] : options;
  return values.filter(
    (value) =>
      field === null ||
      selected.every((filter) =>
        matchesFilter(field, filter, value === BLANK_GROUP ? null : value),
      ),
  );
}

async function listFacetGroups(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  key: string,
  limits: GridLimits,
  signal?: AbortSignal,
): Promise<GroupsResult> {
  if (isFacetOnlyQuery(key, query)) {
    const counters = await listSelectedCounters(def, execute, query, signal);
    return {
      groups: counters
        .filter((facet) => facet.count > 0)
        .map((facet) => ({
          value: facet.value,
          label: null,
          count: facet.count,
          capped: false,
          sums: facet.sums ?? null,
        })),
      source: "counter",
      truncated: false,
    };
  }
  const narrow = await listNarrowSettings(def, execute, query, limits, signal);
  const own = query.filters.filter((filter) => filter.field === key);
  const others = query.filters.filter((filter) => filter.field !== key);
  const values = listFacetGroupValues(getField(def, key), own);
  const cap = limits.countCap;
  const groups = await Promise.all(
    values.map(async (value): Promise<GroupHeader> => {
      const valued = {
        ...query,
        filters: [...others, toGroupFilter(key, value)],
      };
      const [row] = await runFiltered<{ count: number }>(
        def,
        execute,
        valued,
        buildCappedCountSql(def, valued, cap),
        limits,
        narrow,
        signal,
      );
      return {
        value,
        label: null,
        count: Math.min(row.count, cap),
        capped: row.count > cap,
        sums: null,
      };
    }),
  );
  return {
    groups: groups.filter((group) => group.count > 0),
    source: "capped",
    truncated: false,
  };
}

interface GroupRow extends Record<string, string | number | null> {
  value: string | null;
  count: number;
}

export async function listGridGroups(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  signal?: AbortSignal,
  limits: GridLimits = DEFAULT_LIMITS,
): Promise<GroupsResult> {
  assertDeclared(def, query);
  const key = query.group;
  if (key === null) {
    throw new QueryRejected("invalid_value", "invalid_value", {
      field: "group",
    });
  }
  const filters: QueryState = { ...query, group: null, cursor: null };
  if (key === def.facet?.field) {
    return listFacetGroups(def, execute, filters, key, limits, signal);
  }
  const plan = planOrdered(def, filters);
  const limit = limits.narrowLimit;
  assertUnderLimit(
    plan
      ? await sizeOfPlan(def, execute, filters, plan, limit, signal)
      : { rows: limit, over: true, capped: true },
    limit,
  );
  const rows = await execute<GroupRow>(
    buildGroupSql(def, query),
    NARROW_SETTINGS,
    signal,
  );
  const field = getField(def, key);
  return {
    groups: rows.slice(0, GROUP_LIMIT).flatMap((row) => {
      const value = toGroupValue(field, row.value);
      return value === null ? [] : [toGroupHeader(def, row, value)];
    }),
    source: "live",
    truncated: rows.length > GROUP_LIMIT,
  };
}

function toGroupHeader(
  def: PostgresGridDef,
  row: GroupRow,
  value: string,
): GroupHeader {
  return {
    value,
    label:
      row.label === undefined || row.label === null ? null : String(row.label),
    count: row.count,
    capped: false,
    sums: readSums(def, row),
  };
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
    def,
    execute,
    query,
    buildPageSql(def, query, limit, limits),
    limits,
    narrow,
    signal,
  );
  return toPageResult(def, query, rows, limit, limits);
}

// The narrowed set is sized once, before the first page, because a probe before every page of one walk would cost more than the pages.
export async function* walkGridPages(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  pageSize: number = WALK_PAGE_SIZE,
  signal?: AbortSignal,
  limits: GridLimits = DEFAULT_LIMITS,
  maxRows: number = Number.POSITIVE_INFINITY,
): AsyncGenerator<GridRow[]> {
  const narrow = await listNarrowSettings(def, execute, query, limits, signal);
  let cursor: string | null = query.cursor;
  let sent = 0;
  do {
    signal?.throwIfAborted();
    const paged = { ...query, cursor };
    const rows = await runFiltered<GridRow>(
      def,
      execute,
      paged,
      buildPageSql(def, paged, pageSize, limits),
      limits,
      narrow,
      signal,
    );
    const page = toPageResult(def, paged, rows, pageSize, limits);
    sent += page.rows.length;
    yield page.rows;
    cursor = page.nextCursor;
  } while (cursor !== null && sent < maxRows);
}

function resolveExportCap(query: QueryState, limits: GridLimits): number {
  return query.search !== null ? limits.searchLimit : limits.exportLimit;
}

// The result is counted up to the export limit before the first page is read, so an export too large to send is refused before a byte of it is.
export async function* walkExportPages(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  signal?: AbortSignal,
  limits: GridLimits = DEFAULT_LIMITS,
): AsyncGenerator<GridRow[]> {
  const whole: QueryState = { ...query, group: null, cursor: null };
  const limit = resolveExportCap(whole, limits);
  const size = await getGridCount(def, execute, whole, false, signal, {
    ...limits,
    countCap: limit,
  });
  if (size.capped || size.count > limit) {
    throw new QueryRejected("export_too_large", "export_too_large", { limit });
  }
  yield* walkGridPages(
    def,
    execute,
    whole,
    WALK_PAGE_SIZE,
    signal,
    limits,
    limit,
  );
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
  const rows = await execute<CounterRow>(sql, undefined, signal);
  return rows.map((row) => ({
    value: row.value,
    count: row.count,
    sums: readSums(def, row),
  }));
}

async function listSelectedCounters(
  def: PostgresGridDef,
  execute: SqlExecutor,
  query: QueryState,
  signal?: AbortSignal,
): Promise<FacetCount[]> {
  const counts = await listFacetCounts(def, execute, signal);
  const field = def.facet ? getField(def, def.facet.field) : null;
  if (!field) {
    return counts;
  }
  return counts.filter((facet) =>
    query.filters.every(
      (filter) =>
        filter.field !== field.key || matchesFilter(field, filter, facet.value),
    ),
  );
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
      count: sumCounts(counters),
      capped: false,
      source: "counter",
    };
  }
  const narrow = await listNarrowSettings(def, execute, query, limits, signal);
  if (exact) {
    const [row] = await runFiltered<{ count: number }>(
      def,
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
    def,
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
    const rows = sumCounts(counters);
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
    def,
    execute,
    query,
    buildCappedTotalSql(def, query, cap),
    limits,
    [...(isTotalOrdered(def, query) ? TOTAL_SETTINGS : []), ...narrow],
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
