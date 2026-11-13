import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  defaultQuery,
  describeShape,
  isQuickShape,
  type GridRow,
  type OrderedShape,
  type QueryShape,
  type QueryState,
} from "@kikstart/query-grid";
import {
  buildCappedCountSql,
  buildCappedTotalSql,
  buildPageSql,
  buildRowSql,
  encodeCursor,
  QUERY_CANCELED,
  QUICK_BUDGET_MS,
  QUICK_SETTINGS,
  type SqlQuery,
} from "@kikstart/query-grid/server";
import { Client } from "pg";

import { ORDERS_GRID } from "../src/core/orders/orders-grid-def";

const RUNS = Number(process.env.QUERY_GRID_BENCH_RUNS ?? 30);
const PAGE = 200;
const DEEP_OFFSET = 200_000;
const BUDGET_MS = 150;
const QUICK_TERMS = ["Smith", "Mokoena", "Zanele Dlam", "mok", "a M", "12345", "ena 4"];

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
  quick: boolean,
): Promise<Result> {
  const times: number[] = [];
  let plan: PlanNode[] = [];
  let refused = 0;
  for (let run = 0; run < RUNS + 3; run++) {
    if (quick) {
      await client.query(
        ["BEGIN", ...QUICK_SETTINGS.map((item) => `SET LOCAL ${item}`)].join(
          "; ",
        ),
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
    if (quick) {
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
      !types.includes("Sort"),
  };
}

async function pickEqualsValues(
  client: Client,
  shape: OrderedShape,
): Promise<Record<string, string>> {
  if (shape.equals.length === 0) {
    return {};
  }
  const columns = shape.equals.join(", ");
  const { rows } = await client.query<Record<string, string>>(
    `SELECT ${columns} FROM (SELECT ${columns} FROM orders LIMIT 200000) sample
     GROUP BY ${columns} ORDER BY count(*) DESC LIMIT 1`,
  );
  return rows[0];
}

async function pickDeepCursor(
  client: Client,
  query: QueryState,
): Promise<string | null> {
  const filters = Object.keys(query.equals);
  const where = filters.length
    ? `WHERE ${filters.map((key, index) => `${key} = $${index + 1}`).join(" AND ")}`
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
        false,
      ),
      await measure(
        client,
        shape,
        `deep keyset page ${direction}`,
        buildPageSql(ORDERS_GRID, { ...query, cursor }, PAGE),
        false,
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
      false,
    ),
    await measure(
      client,
      shape,
      "capped total",
      buildCappedTotalSql(ORDERS_GRID, base) as SqlQuery,
      false,
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
        false,
      ),
      await measure(
        client,
        shape,
        "range, capped count",
        buildCappedCountSql(ORDERS_GRID, { ...base, range }),
        false,
      ),
    );
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
        true,
      ),
    );
  }
  return results;
}

function formatMs(value: number): string {
  return Number.isNaN(value) ? "–" : value.toFixed(2);
}

function toMarkdown(results: Result[], total: number): string {
  const lines = [
    `Measured ${new Date().toISOString().slice(0, 10)} over ${total.toLocaleString("en-US")} orders, ${RUNS} runs per query after 3 warm-ups; time is planning plus execution from \`EXPLAIN (ANALYZE)\`, in ms.`,
    "",
    "| Shape | Query | p50 | p95 | Plan | Pass |",
    "| --- | --- | ---: | ---: | --- | --- |",
    ...results.map(
      (result) =>
        `| ${result.shape} | ${result.variant} | ${formatMs(result.p50)} | ${formatMs(result.p95)} | ${result.nodes} | ${result.ok ? "yes" : "**no**"} |`,
    ),
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
