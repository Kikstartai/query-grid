import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "pg";

import {
  defaultQuery,
  isQuickShape,
  type GridRow,
  type QueryState,
} from "@kikstart/query-grid";
import {
  buildPageSql,
  getGridTotal,
  listCounterObjects,
  listMissingIndexes,
  QueryRejected,
  toPageResult,
  type PgIndexRow,
  type SqlExecutor,
} from "@kikstart/query-grid/server";

import { ORDERS_GRID } from "../src/core/orders/orders-grid-def";

interface Counter {
  rows: number;
  sum: number;
}

const client = new Client({
  connectionString: process.env.QUERY_GRID_DATABASE_URL,
});

const execute: SqlExecutor = async <T extends object>(sql: {
  text: string;
  values: string[];
}) => {
  const result = await client.query(sql.text, sql.values);
  return result.rows as T[];
};

beforeAll(() => client.connect());
afterAll(() => client.end());

async function readCounters(): Promise<Record<string, Counter>> {
  const { rows } = await client.query<Counter & { status_code: string }>(
    "SELECT status_code, row_count::float8 AS rows, total_sum::float8 AS sum FROM order_status_counts",
  );
  return Object.fromEntries(
    rows.map((row) => [row.status_code, { rows: row.rows, sum: row.sum }]),
  );
}

async function readGrouped(): Promise<Record<string, Counter>> {
  const { rows } = await client.query<Counter & { status_code: string }>(
    "SELECT status_code, count(*)::float8 AS rows, sum(total)::float8 AS sum FROM orders GROUP BY status_code",
  );
  return Object.fromEntries(
    rows.map((row) => [row.status_code, { rows: row.rows, sum: row.sum }]),
  );
}

function withoutEmpty(counters: Record<string, Counter>) {
  return Object.fromEntries(
    Object.entries(counters).filter(([, counter]) => counter.rows !== 0),
  );
}

async function listPage(query: QueryState, limit: number) {
  const sql = buildPageSql(ORDERS_GRID, query, limit);
  const { rows } = await client.query<GridRow>(sql.text, sql.values);
  return toPageResult(ORDERS_GRID, query, rows, limit);
}

describe("generated schema", () => {
  test("every declared shape has its index in pg_indexes", async () => {
    const { rows } = await client.query<PgIndexRow>(
      "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1",
      [ORDERS_GRID.table],
    );
    const missing = listMissingIndexes(ORDERS_GRID, rows);
    expect(missing.map((index) => index.name)).toEqual([]);
  });

  test("the counter table has its columns and the table its three triggers", async () => {
    const counter = listCounterObjects(ORDERS_GRID)!;
    const columns = await client.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
      [counter.table],
    );
    expect(columns.rows.map((row) => row.column_name).sort()).toEqual(
      [...counter.columns].sort(),
    );
    const triggers = await client.query<{ tgname: string }>(
      "SELECT tgname FROM pg_trigger WHERE tgrelid = $1::regclass AND NOT tgisinternal",
      [ORDERS_GRID.table],
    );
    expect(triggers.rows.map((row) => row.tgname).sort()).toEqual(
      [...counter.triggers].sort(),
    );
  });
});

describe("keyset paging", () => {
  test("three keyset pages equal one page three times the size, for every ordered shape", async () => {
    for (const shape of ORDERS_GRID.shapes) {
      if (isQuickShape(shape)) {
        continue;
      }
      const sample = shape.equals.length
        ? await client.query<Record<string, string>>(
            `SELECT ${shape.equals.join(", ")} FROM orders LIMIT 1`,
          )
        : { rows: [{}] };
      for (const direction of ["asc", "desc"] as const) {
        const query: QueryState = {
          ...defaultQuery(ORDERS_GRID),
          equals: sample.rows[0],
          sort: { field: shape.sort, direction },
        };
        const whole = await listPage(query, 150);
        const paged: string[] = [];
        let cursor: string | null = null;
        for (let page = 0; page < 3; page++) {
          const result = await listPage({ ...query, cursor }, 50);
          paged.push(...result.rows.map((row) => row.id));
          cursor = result.nextCursor;
          if (!cursor) {
            break;
          }
        }
        expect(paged).toEqual(whole.rows.map((row) => row.id));
        expect(new Set(paged).size).toBe(paged.length);
      }
    }
  }, 60_000);

  test("an undeclared shape never reaches the database", () => {
    const query: QueryState = {
      ...defaultQuery(ORDERS_GRID),
      equals: { channel: "web" },
      sort: { field: "total", direction: "desc" },
    };
    expect(() => buildPageSql(ORDERS_GRID, query, 50)).toThrow(QueryRejected);
  });
});

describe("quick filter", () => {
  test("it matches a customer name and an order number through one index", async () => {
    const byNumber = await listPage(
      { ...defaultQuery(ORDERS_GRID), quick: "123456" },
      50,
    );
    expect(byNumber.rows.length).toBeGreaterThan(0);
    for (const row of byNumber.rows) {
      expect(`${row.customer_name} ${row.order_number}`).toContain("123456");
    }
    const byName = await listPage(
      { ...defaultQuery(ORDERS_GRID), quick: "zanele dlam" },
      50,
    );
    expect(byName.rows.length).toBeGreaterThan(0);
    for (const row of byName.rows) {
      expect(String(row.customer_name).toLowerCase()).toContain("zanele dlam");
    }
  }, 30_000);
});

describe("status counters", () => {
  test("the counter table's counts and sums equal a GROUP BY", async () => {
    expect(withoutEmpty(await readCounters())).toEqual(await readGrouped());
  }, 120_000);

  test("inserts, updates and deletes keep the counts and sums exact", async () => {
    await client.query("BEGIN");
    try {
      const before = await readCounters();
      const customer = await client.query<{ id: string; name: string }>(
        "SELECT id, name FROM customers LIMIT 1",
      );
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO orders (order_number, status_code, customer_id, customer_name, region, channel, total, item_count)
         SELECT -g, 'pending', $1, $2, 'gauteng', 'web', 1000 * g, 1 FROM generate_series(1, 5) g
         RETURNING id`,
        [customer.rows[0].id, customer.rows[0].name],
      );
      const ids = inserted.rows.map((row) => row.id);
      const afterInsert = await readCounters();
      expect(afterInsert.pending).toEqual({
        rows: before.pending.rows + 5,
        sum: before.pending.sum + 15_000,
      });

      await client.query(
        "UPDATE orders SET status_code = 'paid' WHERE order_number IN (-1, -2)",
      );
      const afterMove = await readCounters();
      expect(afterMove.pending).toEqual({
        rows: before.pending.rows + 3,
        sum: before.pending.sum + 12_000,
      });
      expect(afterMove.paid).toEqual({
        rows: before.paid.rows + 2,
        sum: before.paid.sum + 3000,
      });

      await client.query(
        "UPDATE orders SET total = total + 500 WHERE order_number = -5",
      );
      const afterAmount = await readCounters();
      expect(afterAmount.pending).toEqual({
        rows: before.pending.rows + 3,
        sum: before.pending.sum + 12_500,
      });

      await client.query(
        "UPDATE orders SET status_code = 'cancelled', total = 1 WHERE order_number = -4",
      );
      const afterBoth = await readCounters();
      expect(afterBoth.pending.sum).toBe(before.pending.sum + 8500);
      expect(afterBoth.cancelled).toEqual({
        rows: before.cancelled.rows + 1,
        sum: before.cancelled.sum + 1,
      });

      await client.query(
        "UPDATE orders SET note = 'unchanged status' WHERE id = ANY($1::uuid[])",
        [ids],
      );
      expect(await readCounters()).toEqual(afterBoth);
      expect(withoutEmpty(await readCounters())).toEqual(await readGrouped());

      await client.query("DELETE FROM orders WHERE id = ANY($1::uuid[])", [
        ids,
      ]);
      expect(await readCounters()).toEqual(before);
    } finally {
      await client.query("ROLLBACK");
    }
  }, 120_000);
});

describe("totals", () => {
  const base = defaultQuery(ORDERS_GRID);

  test("a status grouping is a one-row read of the counter table", async () => {
    const total = await getGridTotal(ORDERS_GRID, execute, {
      ...base,
      equals: { status_code: "failed" },
    });
    const real = await client.query<Counter>(
      "SELECT count(*)::float8 AS rows, sum(total)::float8 AS sum FROM orders WHERE status_code = 'failed'",
    );
    expect(total).toEqual({
      available: true,
      sum: real.rows[0].sum,
      rows: real.rows[0].rows,
      source: "counter",
    });
  }, 60_000);

  test("a result under the cap is summed live", async () => {
    const customer = await client.query<{ customer_id: string }>(
      "SELECT customer_id FROM orders ORDER BY created_at LIMIT 1",
    );
    const id = customer.rows[0].customer_id;
    const total = await getGridTotal(ORDERS_GRID, execute, {
      ...base,
      equals: { customer_id: id },
    });
    const real = await client.query<Counter>(
      "SELECT count(*)::float8 AS rows, sum(total)::float8 AS sum FROM orders WHERE customer_id = $1",
      [id],
    );
    expect(total).toEqual({
      available: true,
      sum: real.rows[0].sum,
      rows: real.rows[0].rows,
      source: "live",
    });
  }, 60_000);

  test("a result over the cap has no total, with the reason", async () => {
    const total = await getGridTotal(ORDERS_GRID, execute, {
      ...base,
      equals: { channel: "web" },
    });
    expect(total.available).toBe(false);
    expect(total).toMatchObject({
      reason: expect.stringMatching(
        /^More than 10.000 rows match and no counter totals this filter\.$/,
      ),
    });
  }, 60_000);
});
