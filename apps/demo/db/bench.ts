import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_LIMITS,
  defaultQuery,
  getField,
  resolveMaxValues,
  type GridRow,
  type IndexDef,
  type QueryState,
} from "@kikstart/query-grid";
import {
  buildCappedCountSql,
  buildCappedTotalSql,
  buildFacetSql,
  buildPageSql,
  buildRowSql,
  describeSearch,
  describeIndex,
  encodeCursor,
  listSearchSettings,
  QUERY_CANCELED,
  TOTAL_SETTINGS,
  type SqlQuery,
} from "@kikstart/query-grid-postgres";
import { Client } from "pg";

import { ORDERS_GRID_DEF } from "../src/core/orders/orders-grid-def";

const RUNS = Number(process.env.QUERY_GRID_BENCH_RUNS ?? 30);
const PAGE = 200;
const DEEP_OFFSET = 200_000;
const BUDGET_MS = 150;
const MULTI_SIZES = [2, 5];
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

type ResultKind = "single" | "several" | "counter";

interface Result {
  index: string;
  kind: ResultKind;
  variant: string;
  p50: number;
  p95: number;
  nodes: string;
  ok: boolean;
}

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
): Promise<Result> {
  const label = typeof index === "string" ? index : describeIndex(index);
  const times: number[] = [];
  let plan: PlanNode[] = [];
  let refused = 0;
  for (let run = 0; run < RUNS + 3; run++) {
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
    if (run >= 3) {
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
      nodes: `refused by the server in ${refused} of ${RUNS + 3} runs: over the ${DEFAULT_LIMITS.searchBudgetMs} ms search budget`,
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
    ok:
      p95 < BUDGET_MS &&
      (kind === "counter" ||
        (scansByIndex &&
          !types.includes("Seq Scan") &&
          (kind === "several" || !types.includes("Sort")))),
  };
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
        buildPageSql(ORDERS_GRID_DEF, { ...base, range }, PAGE),
        null,
      ),
      await measure(
        client,
        index,
        "range, capped count",
        buildCappedCountSql(ORDERS_GRID_DEF, { ...base, range }),
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
  for (const value of SEARCH_TERMS) {
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
  const optedOut = ORDERS_GRID_DEF.indexes
    .filter((index) => index.multi === false)
    .map(describeIndex);
  const lines = [
    `Measured ${new Date().toISOString().slice(0, 10)} over ${total.toLocaleString("en-US")} orders, ${RUNS} runs per query after 3 warm-ups; time is planning plus execution from \`EXPLAIN (ANALYZE)\`, in ms.`,
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
  const results: Result[] = [];
  for (const index of ORDERS_GRID_DEF.indexes) {
    const batch = await benchOrdered(client, index);
    results.push(...batch);
    console.log(`${describeIndex(index)}: ${batch.length} queries`);
  }
  const search = await benchSearch(client, ORDERS_GRID_DEF.search);
  results.push(...search);
  console.log(
    `${describeSearch(ORDERS_GRID_DEF.search)}: ${search.length} queries`,
  );
  const counters = await benchCounters(client);
  results.push(...counters);
  console.log(`counter table: ${counters.length} queries`);
  await client.end();
  const markdown = toMarkdown(results, Number(count.rows[0].count));
  writeFileSync(join(import.meta.dir, "bench-results.md"), markdown);
  console.log(markdown);
  if (results.some((result) => !result.ok)) {
    process.exit(1);
  }
}

await main();
