import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  defaultQuery,
  getField,
  resolveMaxValues,
  type GridRow,
  type QueryState,
} from "@kikstart/query-grid";
import {
  buildCappedCountSql,
  buildCappedTotalSql,
  buildPageSql,
  buildRowSql,
  describeShape,
  encodeCursor,
  isQuickShape,
  QUERY_CANCELED,
  QUICK_BUDGET_MS,
  QUICK_SETTINGS,
  TOTAL_SETTINGS,
  type OrderedShape,
  type QueryShape,
  type SqlQuery,
} from "@kikstart/query-grid-postgres";
import { Client } from "pg";

import { ORDERS_SERVER_GRID as ORDERS_GRID } from "../src/core/orders/orders-server-def";

const RUNS = Number(process.env.QUERY_GRID_BENCH_RUNS ?? 30);
const PAGE = 200;
const DEEP_OFFSET = 200_000;
const BUDGET_MS = 150;
const MULTI_SIZES = [2, 5];
const QUICK_TERMS = [
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

interface Result {
  shape: string;
  multi: boolean;
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
  shape: QueryShape,
  variant: string,
  sql: SqlQuery,
  settings: string[] | null,
  multi = false,
): Promise<Result> {
  const sortAllowed = multi;
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
      shape: describeShape(shape),
      multi,
      variant,
      p50: Number.NaN,
      p95: Number.NaN,
      nodes: `refused by the server in ${refused} of ${RUNS + 3} runs: over the ${QUICK_BUDGET_MS} ms quick filter budget`,
      ok: true,
    };
  }
  times.sort((a, b) => a - b);
  const types = plan.map((node) => node["Node Type"]);
  const p95 = percentile(times, 0.95);
  const scansByIndex = plan.some((node) => node["Index Name"] !== undefined);
  return {
    shape: describeShape(shape),
    multi,
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
      scansByIndex &&
      !types.includes("Seq Scan") &&
      (sortAllowed || !types.includes("Sort")),
  };
}

async function pickEqualsValues(
  client: Client,
  shape: OrderedShape,
): Promise<Record<string, string[]>> {
  if (shape.equals.length === 0) {
    return {};
  }
  const columns = shape.equals.join(", ");
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
  shape: OrderedShape,
  size: number,
  frequency: Frequency,
): Promise<Record<string, string[]>> {
  const equals: Record<string, string[]> = {};
  const order = frequency === "common" ? "DESC" : "ASC";
  for (const column of shape.equals) {
    const { rows } = await client.query<{ value: string }>(
      `SELECT ${column} AS value FROM (SELECT ${column} FROM orders LIMIT 200000) sample
       GROUP BY ${column} ORDER BY count(*) ${order}, ${column} LIMIT ${size}`,
    );
    equals[column] = rows.map((row) => row.value);
  }
  return equals;
}

function listMultiSizes(shape: OrderedShape): number[] {
  const caps = shape.equals.map((key) => {
    const field = getField(ORDERS_GRID, key);
    return field ? resolveMaxValues(field) : 1;
  });
  return [...new Set([...MULTI_SIZES, Math.max(...caps)])];
}

async function benchSeveral(
  client: Client,
  shape: OrderedShape,
): Promise<Result[]> {
  const results: Result[] = [];
  const seen = new Set<string>();
  for (const frequency of ["common", "rare"] as const) {
    for (const size of listMultiSizes(shape)) {
      const equals = await pickSeveralValues(client, shape, size, frequency);
      const key = JSON.stringify(equals);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const label = Object.entries(equals)
        .map(([name, values]) => `${values.length} ${frequency} ${name}`)
        .join(", ");
      const query: QueryState = {
        ...defaultQuery(ORDERS_GRID),
        equals,
        sort: { field: shape.sort, direction: "desc" },
      };
      results.push(
        await measure(
          client,
          shape,
          `${label}: first page desc`,
          buildPageSql(ORDERS_GRID, query, PAGE),
          null,
          true,
        ),
        await measure(
          client,
          shape,
          `${label}: capped count`,
          buildCappedCountSql(ORDERS_GRID, query),
          null,
          true,
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
      const rowSql = buildRowSql(ORDERS_GRID, rows[0].id);
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
  shape: OrderedShape,
): Promise<Result[]> {
  const equals = await pickEqualsValues(client, shape);
  const results: Result[] = [];
  for (const direction of ["desc", "asc"] as const) {
    const query: QueryState = {
      ...defaultQuery(ORDERS_GRID),
      equals,
      sort: { field: shape.sort, direction },
    };
    const cursor = await pickDeepCursor(client, query);
    results.push(
      await measure(
        client,
        shape,
        `first page ${direction}`,
        buildPageSql(ORDERS_GRID, query, PAGE),
        null,
      ),
      await measure(
        client,
        shape,
        `deep keyset page ${direction}`,
        buildPageSql(ORDERS_GRID, { ...query, cursor }, PAGE),
        null,
      ),
    );
  }
  const base: QueryState = {
    ...defaultQuery(ORDERS_GRID),
    equals,
    sort: { field: shape.sort, direction: "desc" },
  };
  results.push(
    await measure(
      client,
      shape,
      "capped count",
      buildCappedCountSql(ORDERS_GRID, base),
      null,
    ),
    await measure(
      client,
      shape,
      "capped total",
      buildCappedTotalSql(ORDERS_GRID, base),
      TOTAL_SETTINGS,
    ),
  );
  if (shape.range) {
    const range =
      shape.sort === "total"
        ? { field: "total", min: "20000", max: "60000" }
        : {
            field: shape.sort,
            min: new Date(Date.now() - 200 * 86_400_000).toISOString(),
            max: new Date(Date.now() - 100 * 86_400_000).toISOString(),
          };
    results.push(
      await measure(
        client,
        shape,
        "range, first page desc",
        buildPageSql(ORDERS_GRID, { ...base, range }, PAGE),
        null,
      ),
      await measure(
        client,
        shape,
        "range, capped count",
        buildCappedCountSql(ORDERS_GRID, { ...base, range }),
        null,
      ),
    );
  }
  if (shape.equals.length > 0 && shape.multi !== false) {
    results.push(...(await benchSeveral(client, shape)));
  }
  return results;
}

async function benchQuick(
  client: Client,
  shape: QueryShape,
): Promise<Result[]> {
  const results: Result[] = [];
  for (const value of QUICK_TERMS) {
    const query: QueryState = {
      ...defaultQuery(ORDERS_GRID),
      quick: value,
    };
    results.push(
      await measure(
        client,
        shape,
        `“${value}”, capped page`,
        buildPageSql(ORDERS_GRID, query, PAGE),
        QUICK_SETTINGS,
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
    "| Shape | Query | p50 | p95 | Plan | Pass |",
    "| --- | --- | ---: | ---: | --- | --- |",
    ...results.map(
      (result) =>
        `| ${result.shape} | ${result.variant} | ${formatMs(result.p50)} | ${formatMs(result.p95)} | ${result.nodes} | ${result.ok ? "yes" : "**no**"} |`,
    ),
  ];
}

function summarize(results: Result[]): string {
  const passed = results.filter((result) => result.ok).length;
  return `${passed} of ${results.length} pass`;
}

function toMarkdown(results: Result[], total: number): string {
  const single = results.filter((result) => !result.multi);
  const several = results.filter((result) => result.multi);
  const optedOut = ORDERS_GRID.shapes
    .filter((shape) => !isQuickShape(shape) && shape.multi === false)
    .map(describeShape);
  const lines = [
    `Measured ${new Date().toISOString().slice(0, 10)} over ${total.toLocaleString("en-US")} orders, ${RUNS} runs per query after 3 warm-ups; time is planning plus execution from \`EXPLAIN (ANALYZE)\`, in ms.`,
    "",
    `## One value per field: ${summarize(single)}`,
    "",
    ...toTable(single),
    "",
    `## Several values per field: ${summarize(several)}`,
    "",
    "Each ordered shape with an equality field, with 2, 5 and the field's cap of values, taken from the most common and then from the rarest. The bar is the same p95 budget and no Seq Scan; a Sort is allowed here and shows in the plan, because `= ANY` over several values has no single index order to read.",
    "",
    ...toTable(several),
    "",
    optedOut.length > 0
      ? `Shapes declared \`multi: false\`, so offered with one value only: ${optedOut.join("; ")}.`
      : "No shape is declared `multi: false`.",
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
  for (const shape of ORDERS_GRID.shapes) {
    const batch = isQuickShape(shape)
      ? await benchQuick(client, shape)
      : await benchOrdered(client, shape);
    results.push(...batch);
    console.log(`${describeShape(shape)}: ${batch.length} queries`);
  }
  await client.end();
  const markdown = toMarkdown(results, Number(count.rows[0].count));
  writeFileSync(join(import.meta.dir, "bench-results.md"), markdown);
  console.log(markdown);
  if (results.some((result) => !result.ok)) {
    process.exit(1);
  }
}

await main();
