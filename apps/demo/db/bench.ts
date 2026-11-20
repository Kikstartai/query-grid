import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_LIMITS,
  defaultQuery,
  getField,
  isListFilter,
  isRangeType,
  listSortIndexes,
  listSorts,
  listTextIndexed,
  resolveMaxValues,
  withThenBy,
  type Filter,
  type GridRow,
  type ListFilter,
  type QueryState,
  type SortIndexDef,
  type ValueFilter,
} from "@kikstart/query-grid";
import {
  buildCappedCountSql,
  buildCappedTotalSql,
  buildFacetSql,
  buildGroupSql,
  buildPageSql,
  buildRowSql,
  describeSearch,
  describeIndex,
  describeTextIndex,
  encodeCursor,
  listSearchSettings,
  NARROW_SETTINGS,
  QUERY_CANCELED,
  TOTAL_SETTINGS,
  type SqlQuery,
} from "@kikstart/query-grid-postgres";
import { Client } from "pg";

import { ORDERS_GRID_DEF } from "../src/core/orders/orders-grid-def";

const QUICK = process.argv.includes("--quick");
const RUNS = Number(process.env.QUERY_GRID_BENCH_RUNS ?? (QUICK ? 5 : 30));
const WARM_UPS = QUICK ? 1 : 3;
const PAGE = 200;
const DEEP_OFFSET = 200_000;
const BUDGET_MS = 150;
const NARROW_BUDGET_MS = 500;
const NO_MATCH = "zqxjzqxj";
const EXPORT_PAGE = 1000;
const MULTI_SIZES = [2, 5];
const FILTERED_SEARCH_TERMS = [
  "Smith",
  "Mokoena",
  "Zanele Dlam",
  "mok",
  "12345",
];
const SEARCH_TERMS = [
  "Smith",
  "Mokoena",
  "Zanele Dlam",
  "mok",
  "a M",
  "12345",
  "ena 4",
  "---",
];

interface PlanNode {
  "Node Type": string;
  "Relation Name"?: string;
  "Index Name"?: string;
  Plans?: PlanNode[];
}

interface Explain {
  Plan: PlanNode;
  "Planning Time": number;
  "Execution Time": number;
}

type ResultKind =
  | "single"
  | "several"
  | "counter"
  | "empty"
  | "search"
  | "text"
  | "narrow"
  | "export";

interface Result {
  index: string;
  kind: ResultKind;
  variant: string;
  p50: number;
  p95: number;
  nodes: string;
  ok: boolean;
}

interface Bar {
  budget: number;
  runs: number;
}

const DEFAULT_BAR: Bar = { budget: BUDGET_MS, runs: RUNS };
const SEARCH_BAR: Bar = { budget: DEFAULT_LIMITS.searchBudgetMs, runs: RUNS };
const NARROW_BAR: Bar = { budget: NARROW_BUDGET_MS, runs: RUNS };

function flatten(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(flatten)];
}

function percentile(sorted: number[], fraction: number): number {
  return sorted[
    Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
  ];
}

async function measure(
  client: Client,
  index: SortIndexDef | string,
  variant: string,
  sql: SqlQuery,
  settings: string[] | null,
  kind: ResultKind = "single",
  bar: Bar = DEFAULT_BAR,
): Promise<Result> {
  const label = typeof index === "string" ? index : describeIndex(index);
  const times: number[] = [];
  let plan: PlanNode[] = [];
  let refused = 0;
  for (let run = 0; run < bar.runs + WARM_UPS; run++) {
    if (settings) {
      await client.query(
        ["BEGIN", ...settings.map((item) => `SET LOCAL ${item}`)].join("; "),
      );
    }
    const explained = await client
      .query<{
        "QUERY PLAN": Explain[];
      }>(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql.text}`, sql.values)
      .catch((error: { code?: string }) => {
        if (error.code !== QUERY_CANCELED) {
          throw error;
        }
        return null;
      });
    if (settings) {
      await client.query(explained ? "COMMIT" : "ROLLBACK");
    }
    if (!explained) {
      refused += 1;
      continue;
    }
    const [explain] = explained.rows[0]["QUERY PLAN"];
    plan = flatten(explain.Plan);
    if (run >= WARM_UPS) {
      times.push(explain["Planning Time"] + explain["Execution Time"]);
    }
  }
  if (times.length === 0) {
    return {
      index: label,
      kind,
      variant,
      p50: Number.NaN,
      p95: Number.NaN,
      nodes: `refused by the server in ${refused} of ${bar.runs + WARM_UPS} runs: over the ${DEFAULT_LIMITS.searchBudgetMs} ms search budget`,
      ok: true,
    };
  }
  times.sort((a, b) => a - b);
  const types = plan.map((node) => node["Node Type"]);
  const p95 = percentile(times, 0.95);
  const scansByIndex = plan.some((node) => node["Index Name"] !== undefined);
  return {
    index: label,
    kind,
    variant,
    p50: percentile(times, 0.5),
    p95,
    nodes:
      plan
        .map((node) =>
          node["Index Name"]
            ? `${node["Node Type"]} (${node["Index Name"]})`
            : node["Node Type"],
        )
        .join(" → ") + (refused > 0 ? `; refused in ${refused} runs` : ""),
    ok: p95 < bar.budget && isPlanAllowed(kind, types, scansByIndex),
  };
}

function isPlanAllowed(
  kind: ResultKind,
  types: string[],
  scansByIndex: boolean,
): boolean {
  if (kind === "counter" || kind === "empty" || kind === "narrow") {
    return true;
  }
  if (kind === "export") {
    return scansByIndex && !types.includes("Seq Scan");
  }
  if (!scansByIndex || types.includes("Seq Scan")) {
    return false;
  }
  return kind !== "single" || !types.includes("Sort");
}

function anyOf(field: string, ...values: (string | null)[]): ListFilter {
  return { field, op: "any_of", values };
}

function since(bound: string): Filter {
  return { field: "created_at", op: "greater_or_equal", value: bound };
}

async function pickEqualsValues(
  client: Client,
  index: SortIndexDef,
): Promise<Filter[]> {
  if (index.filter.length === 0) {
    return [];
  }
  const columns = index.filter.join(", ");
  const { rows } = await client.query<Record<string, string>>(
    `SELECT ${columns} FROM (SELECT ${columns} FROM orders LIMIT 200000) sample
     WHERE ${index.filter.map((key) => `${key} IS NOT NULL`).join(" AND ")}
     GROUP BY ${columns} ORDER BY count(*) DESC LIMIT 1`,
  );
  return Object.entries(rows[0]).map(([key, value]) => anyOf(key, value));
}

type Frequency = "common" | "rare";

async function pickSeveralValues(
  client: Client,
  index: SortIndexDef,
  size: number,
  frequency: Frequency,
): Promise<ListFilter[]> {
  const filters: ListFilter[] = [];
  const order = frequency === "common" ? "DESC" : "ASC";
  for (const column of index.filter) {
    const { rows } = await client.query<{ value: string }>(
      `SELECT ${column} AS value FROM (SELECT ${column} FROM orders LIMIT 200000) sample
       WHERE ${column} IS NOT NULL
       GROUP BY ${column} ORDER BY count(*) ${order}, ${column} LIMIT ${size}`,
    );
    filters.push(anyOf(column, ...rows.map((row) => row.value)));
  }
  return filters;
}

function listMultiSizes(index: SortIndexDef): number[] {
  const caps = index.filter.map((key) => {
    const field = getField(ORDERS_GRID_DEF, key);
    return field ? resolveMaxValues(field) : 1;
  });
  return [...new Set([...MULTI_SIZES, Math.max(...caps)])];
}

async function benchSeveral(
  client: Client,
  index: SortIndexDef,
): Promise<Result[]> {
  const results: Result[] = [];
  const seen = new Set<string>();
  for (const frequency of ["common", "rare"] as const) {
    for (const size of listMultiSizes(index)) {
      const filters = await pickSeveralValues(client, index, size, frequency);
      const key = JSON.stringify(filters);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const label = filters
        .map((filter) => `${filter.values.length} ${frequency} ${filter.field}`)
        .join(", ");
      const query: QueryState = {
        ...defaultQuery(ORDERS_GRID_DEF),
        filters,
        sort: { field: index.sort[0], direction: "desc" },
      };
      results.push(
        await measure(
          client,
          index,
          `${label}: first page desc`,
          buildPageSql(ORDERS_GRID_DEF, query, PAGE),
          null,
          "several",
        ),
        await measure(
          client,
          index,
          `${label}: capped count`,
          buildCappedCountSql(ORDERS_GRID_DEF, query),
          null,
          "several",
        ),
      );
    }
  }
  return results;
}

const NUMBER_RANGES: Record<string, [string, string]> = {
  total: ["20000", "60000"],
  item_count: ["2", "4"],
};

function createRange(key: string): Filter | null {
  const field = getField(ORDERS_GRID_DEF, key);
  if (!field || !isRangeType(field.type)) {
    return null;
  }
  const bounds = NUMBER_RANGES[key];
  if (bounds) {
    return { field: key, op: "between", min: bounds[0], max: bounds[1] };
  }
  return {
    field: key,
    op: "between",
    min: new Date(Date.now() - 200 * 86_400_000).toISOString(),
    max: new Date(Date.now() - 100 * 86_400_000).toISOString(),
  };
}

async function pickDeepCursor(
  client: Client,
  query: QueryState,
): Promise<string | null> {
  const lists = query.filters.filter(isListFilter);
  const where = lists.length
    ? `WHERE ${lists.map((filter, index) => `${filter.field} = ANY($${index + 1})`).join(" AND ")}`
    : "";
  const direction = query.sort.direction.toUpperCase();
  const sorts = listSorts(query).map((sort) => sort.field);
  const order = [...sorts, "id"]
    .map((column) => `${column} ${direction}`)
    .join(", ");
  for (const offset of [DEEP_OFFSET, 20_000, 1000]) {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM orders ${where}
       ORDER BY ${order} OFFSET ${offset} LIMIT 1`,
      lists.map((filter) => filter.values),
    );
    if (rows[0]) {
      const rowSql = buildRowSql(ORDERS_GRID_DEF, rows[0].id);
      const row = await client.query<GridRow>(rowSql.text, rowSql.values);
      return encodeCursor({
        sortValues: sorts.map((field) => String(row.rows[0][field])),
        id: rows[0].id,
      });
    }
  }
  return null;
}

async function benchOrdered(
  client: Client,
  index: SortIndexDef,
): Promise<Result[]> {
  const filters = await pickEqualsValues(client, index);
  const results: Result[] = [];
  const ordered = (direction: "asc" | "desc"): QueryState =>
    withThenBy(
      {
        ...defaultQuery(ORDERS_GRID_DEF),
        filters,
        sort: { field: index.sort[0], direction },
      },
      index.sort.slice(1).map((field) => ({ field, direction })),
    );
  for (const direction of ["desc", "asc"] as const) {
    const query = ordered(direction);
    const cursor = await pickDeepCursor(client, query);
    results.push(
      await measure(
        client,
        index,
        `first page ${direction}`,
        buildPageSql(ORDERS_GRID_DEF, query, PAGE),
        null,
      ),
      await measure(
        client,
        index,
        `deep keyset page ${direction}`,
        buildPageSql(ORDERS_GRID_DEF, { ...query, cursor }, PAGE),
        null,
      ),
    );
  }
  const base = ordered("desc");
  results.push(
    await measure(
      client,
      index,
      "capped count",
      buildCappedCountSql(ORDERS_GRID_DEF, base),
      null,
    ),
    await measure(
      client,
      index,
      "capped total",
      buildCappedTotalSql(ORDERS_GRID_DEF, base),
      TOTAL_SETTINGS,
    ),
  );
  if (QUICK) {
    return results;
  }
  const range = createRange(index.sort[0]);
  if (range) {
    const ranged: QueryState = { ...base, filters: [...base.filters, range] };
    results.push(
      await measure(
        client,
        index,
        "range, first page desc",
        buildPageSql(ORDERS_GRID_DEF, ranged, PAGE),
        null,
      ),
      await measure(
        client,
        index,
        "range, capped count",
        buildCappedCountSql(ORDERS_GRID_DEF, ranged),
        null,
      ),
    );
  }
  if (index.filter.length > 0) {
    results.push(...(await benchSeveral(client, index)));
  }
  return results;
}

async function benchSearch(
  client: Client,
  search: string[],
): Promise<Result[]> {
  const results: Result[] = [];
  for (const value of QUICK ? SEARCH_TERMS.slice(0, 2) : SEARCH_TERMS) {
    const query: QueryState = {
      ...defaultQuery(ORDERS_GRID_DEF),
      search: value,
    };
    results.push(
      await measure(
        client,
        describeSearch(search),
        `“${value}”, capped page`,
        buildPageSql(ORDERS_GRID_DEF, query, PAGE),
        listSearchSettings(),
        "single",
        SEARCH_BAR,
      ),
    );
  }
  return results;
}

const TEXT_CASES: [ValueFilter["op"], string][] = [
  ["contains", "Smith"],
  ["contains", "Mokoena"],
  ["contains", "mok"],
  ["starts_with", "Zan"],
  ["ends_with", "ena"],
  ["contains", NO_MATCH],
];

async function benchTextIndexes(client: Client): Promise<Result[]> {
  const results: Result[] = [];
  const cases = QUICK ? TEXT_CASES.slice(1, 3) : TEXT_CASES;
  for (const field of listTextIndexed(ORDERS_GRID_DEF.indexes)) {
    for (const [op, value] of cases) {
      const query: QueryState = { ...BASE, filters: [{ field, op, value }] };
      const variant = `${op} “${value}”`;
      results.push(
        await measure(
          client,
          describeTextIndex(field),
          `${variant}, first page`,
          buildPageSql(ORDERS_GRID_DEF, query, PAGE),
          listSearchSettings(),
          "text",
          SEARCH_BAR,
        ),
        await measure(
          client,
          describeTextIndex(field),
          `${variant}, capped count`,
          buildCappedCountSql(ORDERS_GRID_DEF, query),
          listSearchSettings(),
          "text",
          SEARCH_BAR,
        ),
      );
    }
  }
  return results;
}

async function benchCounters(client: Client): Promise<Result[]> {
  const sql = buildFacetSql(ORDERS_GRID_DEF);
  if (!sql) {
    return [];
  }
  const totals = ORDERS_GRID_DEF.totals.join(", ");
  return [
    await measure(
      client,
      `${ORDERS_GRID_DEF.facet.field} counters`,
      `every count and the sums of ${totals}`,
      sql,
      null,
      "counter",
    ),
  ];
}

const BASE = defaultQuery(ORDERS_GRID_DEF);

function listNullableIndexes(): SortIndexDef[] {
  return listSortIndexes(ORDERS_GRID_DEF.indexes).filter(
    (index) =>
      index.filter.length === 1 &&
      getField(ORDERS_GRID_DEF, index.filter[0])?.nullable === true,
  );
}

async function benchEmpty(
  client: Client,
  index: SortIndexDef,
): Promise<Result[]> {
  const [key] = index.filter;
  const options = getField(ORDERS_GRID_DEF, key)?.options ?? [];
  const [common] = options;
  const rare = options[options.length - 1];
  const everyone = options.map((option) => option.value);
  const variants: [string, Filter][] = [
    ["blank", { field: key, op: "blank" }],
    ["not blank", { field: key, op: "not_blank" }],
    ["blank or the most common value", anyOf(key, null, common.value)],
    ["blank or the rarest value", anyOf(key, null, rare.value)],
    ["blank or every value", anyOf(key, null, ...everyone)],
  ];
  const picked = QUICK ? variants.slice(2, 3) : variants;
  const results: Result[] = [];
  for (const [name, filter] of picked) {
    const query: QueryState = {
      ...BASE,
      filters: [filter],
      sort: { field: index.sort[0], direction: "desc" },
    };
    results.push(
      await measure(
        client,
        index,
        `${name}: first page desc`,
        buildPageSql(ORDERS_GRID_DEF, query, PAGE),
        null,
        "empty",
      ),
      await measure(
        client,
        index,
        `${name}: capped count`,
        buildCappedCountSql(ORDERS_GRID_DEF, query),
        null,
        "empty",
      ),
      await measure(
        client,
        index,
        `${name}: capped total`,
        buildCappedTotalSql(ORDERS_GRID_DEF, query),
        TOTAL_SETTINGS,
        "empty",
      ),
    );
  }
  return results;
}

function listSearchFilters(): [string, Filter[]][] {
  const statuses = (
    getField(ORDERS_GRID_DEF, "status_code")?.options ?? []
  ).map((option) => option.value);
  const [largest] = statuses;
  const smallest = statuses[statuses.length - 1];
  const filters: [string, Filter[]][] = [
    [`status_code = ${largest}`, [anyOf("status_code", largest)]],
    [`status_code = ${smallest}`, [anyOf("status_code", smallest)]],
    [
      `status_code ≠ ${largest}`,
      [anyOf("status_code", ...statuses.filter((value) => value !== largest))],
    ],
    [
      "region and channel, which no index pairs",
      [anyOf("region", "gauteng"), anyOf("channel", "web")],
    ],
    ["assignee blank", [{ field: "assignee", op: "blank" }]],
  ];
  return QUICK ? filters.slice(1, 2) : filters;
}

async function benchFilteredSearch(client: Client): Promise<Result[]> {
  const results: Result[] = [];
  const terms = QUICK
    ? FILTERED_SEARCH_TERMS.slice(0, 1)
    : FILTERED_SEARCH_TERMS;
  for (const term of terms) {
    for (const [name, filters] of listSearchFilters()) {
      results.push(
        await measure(
          client,
          `search with ${name}`,
          `“${term}”, capped page`,
          buildPageSql(
            ORDERS_GRID_DEF,
            { ...BASE, search: term, filters },
            PAGE,
          ),
          listSearchSettings(),
          "search",
          SEARCH_BAR,
        ),
      );
    }
  }
  return results;
}

async function pickBound(client: Client, size: number): Promise<string> {
  const { rows } = await client.query<{ bound: string }>(
    `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS bound
     FROM orders ORDER BY created_at DESC, id DESC OFFSET $1 LIMIT 1`,
    [size - 1],
  );
  return rows[0].bound;
}

const SECOND_SORT = [{ field: "region", direction: "asc" as const }];

async function pickNewestCursor(
  client: Client,
  offset: number,
  sorts: string[],
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM orders ORDER BY created_at DESC, id DESC OFFSET ${offset} LIMIT 1`,
  );
  const rowSql = buildRowSql(ORDERS_GRID_DEF, rows[0].id);
  const row = await client.query<GridRow>(rowSql.text, rowSql.values);
  return encodeCursor({
    sortValues: sorts.map((field) => String(row.rows[0][field])),
    id: rows[0].id,
  });
}

async function benchExport(client: Client, total: number): Promise<Result[]> {
  const size = Math.min(DEFAULT_LIMITS.exportLimit, total);
  const query: QueryState = {
    ...BASE,
    filters: [since(await pickBound(client, size))],
  };
  const cursor = await pickNewestCursor(client, size - EXPORT_PAGE - 1, [
    "created_at",
  ]);
  const cases: [string, SqlQuery][] = [
    [
      "the count that refuses an export over the limit",
      buildCappedCountSql(ORDERS_GRID_DEF, query, DEFAULT_LIMITS.exportLimit),
    ],
    [
      "first page of 1,000 rows",
      buildPageSql(ORDERS_GRID_DEF, query, EXPORT_PAGE),
    ],
    [
      "last page of 1,000 rows, by keyset",
      buildPageSql(ORDERS_GRID_DEF, { ...query, cursor }, EXPORT_PAGE),
    ],
  ];
  const results: Result[] = [];
  for (const [variant, sql] of cases) {
    results.push(
      await measure(
        client,
        `export of ${size.toLocaleString("en-US")} rows`,
        variant,
        sql,
        null,
        "export",
      ),
    );
  }
  return results;
}

async function benchNarrowed(client: Client, total: number): Promise<Result[]> {
  const size = Math.min(DEFAULT_LIMITS.narrowLimit, total);
  const counters = await client.query<{ rows: string }>(
    `SELECT min(row_count) AS rows FROM ${ORDERS_GRID_DEF.facet.counterTable}`,
  );
  const core: QueryState = {
    ...BASE,
    filters: [since(await pickBound(client, size))],
  };
  const smallest = (getField(ORDERS_GRID_DEF, "status_code")?.options ?? []).at(
    -1,
  );
  const either: QueryState = {
    ...BASE,
    combine: "or",
    sort: { field: "total", direction: "desc" },
    filters: [
      anyOf("status_code", smallest?.value ?? ""),
      since(
        await pickBound(
          client,
          Math.max(1, size - Number(counters.rows[0].rows)),
        ),
      ),
    ],
  };
  const beside = (filter: Filter): QueryState => ({
    ...core,
    filters: [...core.filters, filter],
  });
  const cases: [string, SqlQuery][] = [
    [
      "size probe: capped count of the indexed filters",
      buildCappedCountSql(ORDERS_GRID_DEF, core, size),
    ],
    [
      "contains with no match: first page",
      buildPageSql(
        ORDERS_GRID_DEF,
        beside({ field: "customer_name", op: "contains", value: NO_MATCH }),
        PAGE,
      ),
    ],
    [
      "second range with no match: first page",
      buildPageSql(
        ORDERS_GRID_DEF,
        beside({
          field: "total",
          op: "greater_or_equal",
          value: "999999999999",
        }),
        PAGE,
      ),
    ],
    [
      "customer name equals with no match: first page",
      buildPageSql(
        ORDERS_GRID_DEF,
        beside({ field: "customer_name", op: "equals", value: NO_MATCH }),
        PAGE,
      ),
    ],
    [
      "match any, sorted by another field: first page",
      buildPageSql(ORDERS_GRID_DEF, either, PAGE),
    ],
    [
      "group by region: live GROUP BY with both sums",
      buildGroupSql(ORDERS_GRID_DEF, { ...core, group: "region" }),
    ],
    [
      "a second sort column the other way: first page",
      buildPageSql(ORDERS_GRID_DEF, withThenBy(core, SECOND_SORT), PAGE),
    ],
    [
      "a second sort column the other way: keyset page from the far end",
      buildPageSql(
        ORDERS_GRID_DEF,
        {
          ...withThenBy(core, SECOND_SORT),
          cursor: await pickNewestCursor(client, size - PAGE - 1, [
            "created_at",
            "region",
          ]),
        },
        PAGE,
      ),
    ],
  ];
  const results: Result[] = [];
  for (const [variant, sql] of cases) {
    results.push(
      await measure(
        client,
        `narrowed set of ${size.toLocaleString("en-US")} rows`,
        variant,
        sql,
        NARROW_SETTINGS,
        "narrow",
        NARROW_BAR,
      ),
    );
  }
  return results;
}

function formatMs(value: number): string {
  return Number.isNaN(value) ? "–" : value.toFixed(2);
}

function toTable(results: Result[]): string[] {
  return [
    "| Index | Query | p50 | p95 | Plan | Pass |",
    "| --- | --- | ---: | ---: | --- | --- |",
    ...results.map(
      (result) =>
        `| ${result.index} | ${result.variant} | ${formatMs(result.p50)} | ${formatMs(result.p95)} | ${result.nodes} | ${result.ok ? "yes" : "**no**"} |`,
    ),
  ];
}

function summarize(results: Result[]): string {
  const passed = results.filter((result) => result.ok).length;
  return `${passed} of ${results.length} pass`;
}

function toMarkdown(results: Result[], total: number): string {
  const single = results.filter((result) => result.kind === "single");
  const several = results.filter((result) => result.kind === "several");
  const counters = results.filter((result) => result.kind === "counter");
  const empty = results.filter((result) => result.kind === "empty");
  const searched = results.filter((result) => result.kind === "search");
  const narrowed = results.filter((result) => result.kind === "narrow");
  const texts = results.filter((result) => result.kind === "text");
  const exported = results.filter((result) => result.kind === "export");
  const lines = [
    `Measured ${new Date().toISOString().slice(0, 10)} over ${total.toLocaleString("en-US")} orders, ${RUNS} runs per query after ${WARM_UPS} warm-ups; time is planning plus execution from \`EXPLAIN (ANALYZE)\`, in ms.`,
    "",
    `## One value per field: ${summarize(single)}`,
    "",
    ...toTable(single),
    "",
    `## Several values per field: ${summarize(several)}`,
    "",
    "Each ordered index with an equality field, with 2, 5 and the field's cap of values, taken from the most common and then from the rarest. The bar is the same p95 budget and no Seq Scan; a Sort is allowed here and shows in the plan, because `= ANY` over several values has no single index order to read.",
    "",
    ...toTable(several),
    "",
    `## Counts and totals from the counter table: ${summarize(counters)}`,
    "",
    "One read answers the facet counts, the count and every total of a query that filters on the facet alone. The table holds one row per facet value, so the bar is the p95 budget alone.",
    "",
    ...toTable(counters),
    "",
    `## Blank values: ${summarize(empty)}`,
    "",
    "Each index on a nullable field, with blank, not blank, and blank beside real values, as a first page, a capped count and a capped total. The bar is the p95 budget alone: a mixed list reads through whichever plan stops first, and the plan is shown.",
    "",
    ...toTable(empty),
    "",
    `## Search with equality filters: ${summarize(searched)}`,
    "",
    `Each term beside each filter, under the ${DEFAULT_LIMITS.searchBudgetMs} ms search budget. The bar is that budget and an index scan; a run the server refuses at the budget is counted in the plan column.`,
    "",
    ...toTable(searched),
    "",
    `## Text filters with an index of their own: ${summarize(texts)}`,
    "",
    `A contains, a starts-with and an ends-with on a field with a text index, as an ordered first page and a capped count, under the ${DEFAULT_LIMITS.searchBudgetMs} ms search budget. The bar is that budget and an index scan; a run the server refuses at the budget is counted in the plan column.`,
    "",
    ...toTable(texts),
    "",
    `## Narrowed set: ${summarize(narrowed)}`,
    "",
    `Each expensive operation, and a live GROUP BY, over the ${DEFAULT_LIMITS.narrowLimit.toLocaleString("en-US")} rows \`narrowLimit\` allows: the newest orders, bounded on \`created_at\`. Each is the worst case, where nothing matches and the whole set is read. The bar is a p95 under ${NARROW_BUDGET_MS} ms.`,
    "",
    ...toTable(narrowed),
    "",
    `## Export: ${summarize(exported)}`,
    "",
    `An export of ${DEFAULT_LIMITS.exportLimit.toLocaleString("en-US")} rows, the most \`exportLimit\` allows: the count that refuses a larger one, then its first and its last keyset page of ${EXPORT_PAGE.toLocaleString("en-US")} rows. The bar is the p95 budget for each statement, read through an index.`,
    "",
    ...toTable(exported),
  ];
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const client = new Client({
    connectionString: process.env.QUERY_GRID_DATABASE_URL,
  });
  await client.connect();
  const count = await client.query<{ count: string }>(
    "SELECT sum(row_count) AS count FROM order_status_counts",
  );
  const total = Number(count.rows[0].count);
  const results: Result[] = [];
  const sortIndexes = listSortIndexes(ORDERS_GRID_DEF.indexes);
  const indexes = QUICK
    ? [
        ...sortIndexes.slice(0, 3),
        ...sortIndexes.filter((index) => index.sort.length > 1),
      ]
    : sortIndexes;
  for (const index of indexes) {
    const batch = await benchOrdered(client, index);
    results.push(...batch);
    console.log(`${describeIndex(index)}: ${batch.length} queries`);
  }
  for (const index of listNullableIndexes()) {
    const batch = await benchEmpty(client, index);
    results.push(...batch);
    console.log(`blank values on ${index.filter[0]}: ${batch.length} queries`);
  }
  const filtered = await benchFilteredSearch(client);
  results.push(...filtered);
  console.log(`search with equality filters: ${filtered.length} queries`);
  const texts = await benchTextIndexes(client);
  results.push(...texts);
  console.log(`text indexes: ${texts.length} queries`);
  const narrowed = await benchNarrowed(client, total);
  results.push(...narrowed);
  console.log(`narrowed set: ${narrowed.length} queries`);
  const exported = await benchExport(client, total);
  results.push(...exported);
  console.log(`export: ${exported.length} queries`);
  const search = await benchSearch(client, ORDERS_GRID_DEF.search);
  results.push(...search);
  console.log(
    `${describeSearch(ORDERS_GRID_DEF.search)}: ${search.length} queries`,
  );
  const counters = await benchCounters(client);
  results.push(...counters);
  console.log(`counter table: ${counters.length} queries`);
  await client.end();
  const failed = results.filter((result) => !result.ok);
  if (QUICK) {
    console.log(toTable(results).join("\n"));
    console.log(`quick check: ${summarize(results)}`);
  } else {
    const markdown = toMarkdown(results, total);
    writeFileSync(join(import.meta.dir, "bench-results.md"), markdown);
    console.log(markdown);
  }
  if (failed.length > 0) {
    process.exit(1);
  }
}

await main();
