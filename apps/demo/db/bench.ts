import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_LIMITS,
  defaultQuery,
  EMPTY_VALUE,
  getField,
  NOT_EMPTY_VALUE,
  resolveMaxValues,
  type GridRow,
  type IndexDef,
  type QueryState,
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
const NARROW_RUNS = Math.max(3, Math.ceil(RUNS / 2));
const WARM_UPS = QUICK ? 1 : 3;
const PAGE = 200;
const DEEP_OFFSET = 200_000;
const BUDGET_MS = 150;
const NARROW_BUDGET_MS = 500;
const NARROW_LADDER = [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
const NO_MATCH = "zqxjzqxj";
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
  | "narrow";

interface Result {
  index: string;
  kind: ResultKind;
  variant: string;
  p50: number;
  p95: number;
  nodes: string;
  ok: boolean;
  size?: number;
}

interface Bar {
  budget: number;
  runs: number;
}

const DEFAULT_BAR: Bar = { budget: BUDGET_MS, runs: RUNS };
const SEARCH_BAR: Bar = { budget: DEFAULT_LIMITS.searchBudgetMs, runs: RUNS };
const NARROW_BAR: Bar = { budget: NARROW_BUDGET_MS, runs: NARROW_RUNS };

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
  index: IndexDef | string,
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
  if (!scansByIndex || types.includes("Seq Scan")) {
    return false;
  }
  return kind !== "single" || !types.includes("Sort");
}

async function pickEqualsValues(
  client: Client,
  index: IndexDef,
): Promise<Record<string, string[]>> {
  if (index.equals.length === 0) {
    return {};
  }
  const columns = index.equals.join(", ");
  const { rows } = await client.query<Record<string, string>>(
    `SELECT ${columns} FROM (SELECT ${columns} FROM orders LIMIT 200000) sample
     WHERE ${index.equals.map((key) => `${key} IS NOT NULL`).join(" AND ")}
     GROUP BY ${columns} ORDER BY count(*) DESC LIMIT 1`,
  );
  return Object.fromEntries(
    Object.entries(rows[0]).map(([key, value]) => [key, [value]]),
  );
}

type Frequency = "common" | "rare";

async function pickSeveralValues(
  client: Client,
  index: IndexDef,
  size: number,
  frequency: Frequency,
): Promise<Record<string, string[]>> {
  const equals: Record<string, string[]> = {};
  const order = frequency === "common" ? "DESC" : "ASC";
  for (const column of index.equals) {
    const { rows } = await client.query<{ value: string }>(
      `SELECT ${column} AS value FROM (SELECT ${column} FROM orders LIMIT 200000) sample
       WHERE ${column} IS NOT NULL
       GROUP BY ${column} ORDER BY count(*) ${order}, ${column} LIMIT ${size}`,
    );
    equals[column] = rows.map((row) => row.value);
  }
  return equals;
}

function listMultiSizes(index: IndexDef): number[] {
  const caps = index.equals.map((key) => {
    const field = getField(ORDERS_GRID_DEF, key);
    return field ? resolveMaxValues(field) : 1;
  });
  return [...new Set([...MULTI_SIZES, Math.max(...caps)])];
}

async function benchSeveral(
  client: Client,
  index: IndexDef,
): Promise<Result[]> {
  const results: Result[] = [];
  const seen = new Set<string>();
  for (const frequency of ["common", "rare"] as const) {
    for (const size of listMultiSizes(index)) {
      const equals = await pickSeveralValues(client, index, size, frequency);
      const key = JSON.stringify(equals);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const label = Object.entries(equals)
        .map(([name, values]) => `${values.length} ${frequency} ${name}`)
        .join(", ");
      const query: QueryState = {
        ...defaultQuery(ORDERS_GRID_DEF),
        equals,
        sort: { field: index.sort, direction: "desc" },
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

async function pickDeepCursor(
  client: Client,
  query: QueryState,
): Promise<string | null> {
  const filters = Object.keys(query.equals);
  const where = filters.length
    ? `WHERE ${filters.map((key, index) => `${key} = ANY($${index + 1})`).join(" AND ")}`
    : "";
  const direction = query.sort.direction.toUpperCase();
  for (const offset of [DEEP_OFFSET, 20_000, 1000]) {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM orders ${where}
       ORDER BY ${query.sort.field} ${direction}, id ${direction} OFFSET ${offset} LIMIT 1`,
      Object.values(query.equals),
    );
    if (rows[0]) {
      const rowSql = buildRowSql(ORDERS_GRID_DEF, rows[0].id);
      const row = await client.query<GridRow>(rowSql.text, rowSql.values);
      return encodeCursor({
        sortValue: String(row.rows[0][query.sort.field]),
        id: rows[0].id,
      });
    }
  }
  return null;
}

async function benchOrdered(
  client: Client,
  index: IndexDef,
): Promise<Result[]> {
  const equals = await pickEqualsValues(client, index);
  const results: Result[] = [];
  for (const direction of ["desc", "asc"] as const) {
    const query: QueryState = {
      ...defaultQuery(ORDERS_GRID_DEF),
      equals,
      sort: { field: index.sort, direction },
    };
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
  const base: QueryState = {
    ...defaultQuery(ORDERS_GRID_DEF),
    equals,
    sort: { field: index.sort, direction: "desc" },
  };
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
  if (index.range) {
    const range =
      index.sort === "total"
        ? { field: "total", min: "20000", max: "60000" }
        : {
            field: index.sort,
            min: new Date(Date.now() - 200 * 86_400_000).toISOString(),
            max: new Date(Date.now() - 100 * 86_400_000).toISOString(),
          };
    results.push(
      await measure(
        client,
        index,
        "range, first page desc",
        buildPageSql(ORDERS_GRID_DEF, { ...base, ranges: [range] }, PAGE),
        null,
      ),
      await measure(
        client,
        index,
        "range, capped count",
        buildCappedCountSql(ORDERS_GRID_DEF, { ...base, ranges: [range] }),
        null,
      ),
    );
  }
  if (index.equals.length > 0 && index.multi !== false) {
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

function listNullableIndexes(): IndexDef[] {
  return ORDERS_GRID_DEF.indexes.filter(
    (index) =>
      index.equals.length === 1 &&
      getField(ORDERS_GRID_DEF, index.equals[0])?.nullable === true,
  );
}

async function benchEmpty(client: Client, index: IndexDef): Promise<Result[]> {
  const [key] = index.equals;
  const options = getField(ORDERS_GRID_DEF, key)?.options ?? [];
  const [common] = options;
  const rare = options[options.length - 1];
  const everyone = options.map((option) => option.value);
  const variants: [string, string[]][] = [
    ["empty", [EMPTY_VALUE]],
    ["not empty", [NOT_EMPTY_VALUE]],
    ["empty or the most common value", [EMPTY_VALUE, common.value]],
    ["empty or the rarest value", [EMPTY_VALUE, rare.value]],
    ["empty or every value", [EMPTY_VALUE, ...everyone]],
  ];
  const picked = QUICK ? variants.slice(2, 3) : variants;
  const results: Result[] = [];
  for (const [name, values] of picked) {
    const query: QueryState = {
      ...BASE,
      equals: { [key]: values },
      sort: { field: index.sort, direction: "desc" },
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

function listSearchFilters(): [string, QueryState["equals"]][] {
  const statuses = (
    getField(ORDERS_GRID_DEF, "status_code")?.options ?? []
  ).map((option) => option.value);
  const [largest] = statuses;
  const smallest = statuses[statuses.length - 1];
  const filters: [string, QueryState["equals"]][] = [
    [`status_code = ${largest}`, { status_code: [largest] }],
    [`status_code = ${smallest}`, { status_code: [smallest] }],
    [
      `status_code ≠ ${largest}`,
      { status_code: statuses.filter((value) => value !== largest) },
    ],
    [
      "region and channel, which no index pairs",
      {
        region: ["gauteng"],
        channel: ["web"],
      },
    ],
    ["assignee empty", { assignee: [EMPTY_VALUE] }],
  ];
  return QUICK ? filters.slice(1, 2) : filters;
}

async function benchFilteredSearch(client: Client): Promise<Result[]> {
  const results: Result[] = [];
  const terms = QUICK
    ? FILTERED_SEARCH_TERMS.slice(0, 1)
    : FILTERED_SEARCH_TERMS;
  for (const term of terms) {
    for (const [name, equals] of listSearchFilters()) {
      results.push(
        await measure(
          client,
          `search with ${name}`,
          `“${term}”, capped page`,
          buildPageSql(
            ORDERS_GRID_DEF,
            { ...BASE, search: term, equals },
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

async function benchNarrowedSet(
  client: Client,
  size: number,
  facetRows: number,
): Promise<Result[]> {
  const core: QueryState = {
    ...BASE,
    ranges: [
      { field: "created_at", min: await pickBound(client, size), max: null },
    ],
  };
  const smallest = (getField(ORDERS_GRID_DEF, "status_code")?.options ?? []).at(
    -1,
  );
  const either: QueryState = {
    ...BASE,
    match: "any",
    sort: { field: "total", direction: "desc" },
    equals: { status_code: [smallest?.value ?? ""] },
    ranges: [
      {
        field: "created_at",
        min: await pickBound(client, Math.max(1, size - facetRows)),
        max: null,
      },
    ],
  };
  const cases: [string, SqlQuery][] = [
    [
      "size probe: capped count of the indexed filters",
      buildCappedCountSql(ORDERS_GRID_DEF, core, size),
    ],
    [
      "contains, no match: first page",
      buildPageSql(
        ORDERS_GRID_DEF,
        { ...core, contains: { field: "customer_name", value: NO_MATCH } },
        PAGE,
      ),
    ],
    [
      "contains, common text: first page",
      buildPageSql(
        ORDERS_GRID_DEF,
        { ...core, contains: { field: "customer_name", value: "mok" } },
        PAGE,
      ),
    ],
    [
      "contains, no match: capped count",
      buildCappedCountSql(ORDERS_GRID_DEF, {
        ...core,
        contains: { field: "customer_name", value: NO_MATCH },
      }),
    ],
    [
      "second range, no match: first page",
      buildPageSql(
        ORDERS_GRID_DEF,
        {
          ...core,
          ranges: [
            ...core.ranges,
            { field: "total", min: "999999999999", max: null },
          ],
        },
        PAGE,
      ),
    ],
    [
      "second range, no match: capped count",
      buildCappedCountSql(ORDERS_GRID_DEF, {
        ...core,
        ranges: [
          ...core.ranges,
          { field: "total", min: "999999999999", max: null },
        ],
      }),
    ],
    [
      "match any, sorted by another field: first page",
      buildPageSql(ORDERS_GRID_DEF, either, PAGE),
    ],
    ["match any: capped count", buildCappedCountSql(ORDERS_GRID_DEF, either)],
    [
      "group by region: live GROUP BY with both sums",
      buildGroupSql(ORDERS_GRID_DEF, { ...core, group: "region" }),
    ],
    [
      "group by customer: live GROUP BY with labels",
      buildGroupSql(ORDERS_GRID_DEF, { ...core, group: "customer_id" }),
    ],
  ];
  const picked = QUICK
    ? cases.filter((_, at) => [0, 1, 6, 8].includes(at))
    : cases;
  const results: Result[] = [];
  for (const [variant, sql] of picked) {
    const result = await measure(
      client,
      "narrowed set",
      variant,
      sql,
      NARROW_SETTINGS,
      "narrow",
      NARROW_BAR,
    );
    const informative = size > DEFAULT_LIMITS.narrowLimit;
    results.push({ ...result, size, ok: result.ok || informative });
  }
  return results;
}

function listLadder(total: number): number[] {
  if (QUICK) {
    return [Math.min(DEFAULT_LIMITS.narrowLimit, total)];
  }
  const below = NARROW_LADDER.filter((size) => size < total);
  return [...below, total];
}

async function benchNarrowed(client: Client, total: number): Promise<Result[]> {
  const counters = await client.query<{ rows: string }>(
    `SELECT min(row_count) AS rows FROM ${ORDERS_GRID_DEF.facet.counterTable}`,
  );
  const results: Result[] = [];
  for (const size of listLadder(total)) {
    const batch = await benchNarrowedSet(
      client,
      size,
      Number(counters.rows[0].rows),
    );
    results.push(...batch);
    console.log(
      `narrowed set of ${size.toLocaleString("en-US")}: ${batch.length} queries`,
    );
  }
  return results;
}

function resolveNarrowLimit(results: Result[]): number {
  const sizes = [...new Set(results.map((result) => result.size ?? 0))].sort(
    (a, b) => a - b,
  );
  let limit = 0;
  for (const size of sizes) {
    const within = results
      .filter((result) => result.size === size)
      .every((result) => result.p95 < NARROW_BUDGET_MS);
    if (!within) {
      break;
    }
    limit = size;
  }
  return limit;
}

function toNarrowTable(results: Result[]): string[] {
  const sizes = [...new Set(results.map((result) => result.size ?? 0))];
  const variants = [...new Set(results.map((result) => result.variant))];
  const cell = (variant: string, size: number) => {
    const result = results.find(
      (item) => item.variant === variant && item.size === size,
    );
    return result ? `${formatMs(result.p50)} / ${formatMs(result.p95)}` : "–";
  };
  return [
    `| Operation | ${sizes.map((size) => size.toLocaleString("en-US")).join(" | ")} |`,
    `| --- | ${sizes.map(() => "---:").join(" | ")} |`,
    ...variants.map(
      (variant) =>
        `| ${variant} | ${sizes.map((size) => cell(variant, size)).join(" | ")} |`,
    ),
  ];
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
  const narrowLimit = resolveNarrowLimit(narrowed);
  const optedOut = ORDERS_GRID_DEF.indexes
    .filter((index) => index.multi === false)
    .map(describeIndex);
  const lines = [
    `Measured ${new Date().toISOString().slice(0, 10)} over ${total.toLocaleString("en-US")} orders, ${RUNS} runs per query after ${WARM_UPS} warm-ups (${NARROW_RUNS} runs for the narrowed-set ladder); time is planning plus execution from \`EXPLAIN (ANALYZE)\`, in ms.`,
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
    optedOut.length > 0
      ? `Indexes declared \`multi: false\`, so offered with one value only: ${optedOut.join("; ")}.`
      : "No index is declared `multi: false`.",
    "",
    `## Empty values: ${summarize(empty)}`,
    "",
    "Each index on a nullable field, with empty, not empty, and empty beside real values, as a first page, a capped count and a capped total. The bar is the p95 budget alone: a mixed list reads through whichever plan stops first, and the plan is shown.",
    "",
    ...toTable(empty),
    "",
    `## Search with equality filters: ${summarize(searched)}`,
    "",
    `Each term beside each filter, under the ${DEFAULT_LIMITS.searchBudgetMs} ms search budget. The bar is that budget and an index scan; a run the server refuses at the budget is counted in the plan column.`,
    "",
    ...toTable(searched),
    "",
    `## Narrowed set: ${summarize(narrowed)}`,
    "",
    `Each expensive operation over a set of rows the indexed filters leave, for a ladder of set sizes, as p50 / p95. The set is the newest orders, bounded on \`created_at\`. The bar is a p95 under ${NARROW_BUDGET_MS} ms at every size up to \`narrowLimit\`; larger sizes are measured to place the limit.`,
    "",
    ...toNarrowTable(narrowed),
    "",
    `Largest set size where every operation's p95 is under ${NARROW_BUDGET_MS} ms: ${narrowLimit.toLocaleString("en-US")}. \`DEFAULT_LIMITS.narrowLimit\` is ${DEFAULT_LIMITS.narrowLimit.toLocaleString("en-US")}.`,
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
  const indexes = QUICK
    ? ORDERS_GRID_DEF.indexes.slice(0, 3)
    : ORDERS_GRID_DEF.indexes;
  for (const index of indexes) {
    const batch = await benchOrdered(client, index);
    results.push(...batch);
    console.log(`${describeIndex(index)}: ${batch.length} queries`);
  }
  for (const index of listNullableIndexes()) {
    const batch = await benchEmpty(client, index);
    results.push(...batch);
    console.log(`empty values on ${index.equals[0]}: ${batch.length} queries`);
  }
  const filtered = await benchFilteredSearch(client);
  results.push(...filtered);
  console.log(`search with equality filters: ${filtered.length} queries`);
  results.push(...(await benchNarrowed(client, total)));
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
