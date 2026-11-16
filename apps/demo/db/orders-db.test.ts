import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "pg";

import {
  DEFAULT_LIMITS,
  defaultQuery,
  EMPTY_VALUE,
  getGroupQuery,
  NOT_EMPTY_VALUE,
  type GridRow,
  type QueryState,
  type TotalResult,
} from "@kikstart/query-grid";
import {
  buildPageSql,
  getGridCount,
  getNarrowedSizes,
  listCounterObjects,
  listGridGroups,
  listGridPage,
  listGridTotals,
  listMissingIndexes,
  QueryRejected,
  toPageResult,
  type PgIndexRow,
  type SqlExecutor,
  type SqlQuery,
} from "@kikstart/query-grid-postgres";

import { ORDERS_GRID_DEF } from "../src/core/orders/orders-grid-def";

interface Counter {
  rows: number;
  sum: number;
  items: number;
}

const client = new Client({
  connectionString: process.env.QUERY_GRID_DATABASE_URL,
});

const execute: SqlExecutor = async <T extends object>(sql: SqlQuery) => {
  const result = await client.query(sql.text, sql.values);
  return result.rows as T[];
};

beforeAll(() => client.connect());
afterAll(() => client.end());

async function readCounters(): Promise<Record<string, Counter>> {
  const { rows } = await client.query<Counter & { status_code: string }>(
    "SELECT status_code, row_count::float8 AS rows, total_sum::float8 AS sum, item_count_sum::float8 AS items FROM order_status_counts",
  );
  return Object.fromEntries(
    rows.map(({ status_code, ...counter }) => [status_code, counter]),
  );
}

async function readGrouped(): Promise<Record<string, Counter>> {
  const { rows } = await client.query<Counter & { status_code: string }>(
    "SELECT status_code, count(*)::float8 AS rows, sum(total)::float8 AS sum, sum(item_count)::float8 AS items FROM orders GROUP BY status_code",
  );
  return Object.fromEntries(
    rows.map(({ status_code, ...counter }) => [status_code, counter]),
  );
}

function withoutEmpty(counters: Record<string, Counter>) {
  return Object.fromEntries(
    Object.entries(counters).filter(([, counter]) => counter.rows !== 0),
  );
}

async function listPage(query: QueryState, limit: number) {
  const sql = buildPageSql(ORDERS_GRID_DEF, query, limit);
  const { rows } = await client.query<GridRow>(sql.text, sql.values);
  return toPageResult(ORDERS_GRID_DEF, query, rows, limit);
}

describe("generated schema", () => {
  test("every declared index is in pg_indexes", async () => {
    const { rows } = await client.query<PgIndexRow>(
      "SELECT p.indexname, p.indexdef, i.indisvalid AS valid FROM pg_indexes p JOIN pg_class c ON c.relname = p.indexname JOIN pg_index i ON i.indexrelid = c.oid WHERE p.schemaname = 'public' AND p.tablename = $1",
      [ORDERS_GRID_DEF.table],
    );
    const missing = listMissingIndexes(ORDERS_GRID_DEF, rows);
    expect(missing.map((index) => index.name)).toEqual([]);
  });

  test("the counter table has its columns, the table its three triggers, and no backfill is left half done", async () => {
    const counter = listCounterObjects(ORDERS_GRID_DEF)!;
    const columns = await client.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
      [counter.table],
    );
    expect(columns.rows.map((row) => row.column_name).sort()).toEqual(
      [...counter.columns].sort(),
    );
    const triggers = await client.query<{ tgname: string }>(
      "SELECT tgname FROM pg_trigger WHERE tgrelid = $1::regclass AND NOT tgisinternal",
      [ORDERS_GRID_DEF.table],
    );
    expect(triggers.rows.map((row) => row.tgname).sort()).toEqual(
      [...counter.triggers].sort(),
    );
    const pending = await client.query(
      "SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = $1",
      [counter.pending],
    );
    expect(pending.rows).toEqual([]);
  });
});

describe("keyset paging", () => {
  test("three keyset pages equal one page three times the size, for every ordered index", async () => {
    for (const index of ORDERS_GRID_DEF.indexes) {
      const sample = index.equals.length
        ? await client.query<Record<string, string>>(
            `SELECT ${index.equals.join(", ")} FROM orders WHERE ${index.equals.map((key) => `${key} IS NOT NULL`).join(" AND ")} LIMIT 1`,
          )
        : { rows: [{}] };
      for (const direction of ["asc", "desc"] as const) {
        const query: QueryState = {
          ...defaultQuery(ORDERS_GRID_DEF),
          equals: Object.fromEntries(
            Object.entries(sample.rows[0]).map(([key, value]) => [
              key,
              [value],
            ]),
          ),
          sort: { field: index.sort, direction },
          thenBy: index.then?.map((field) => ({ field, direction })),
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

  test("an unindexed query never reaches the database", () => {
    const query: QueryState = {
      ...defaultQuery(ORDERS_GRID_DEF),
      equals: { channel: ["web"] },
      sort: { field: "total", direction: "desc" },
    };
    expect(() => buildPageSql(ORDERS_GRID_DEF, query, 50)).toThrow(
      QueryRejected,
    );
  });
});

describe("search", () => {
  test("it matches a customer name and an order number through one index", async () => {
    const byNumber = await listPage(
      { ...defaultQuery(ORDERS_GRID_DEF), search: "123456" },
      50,
    );
    expect(byNumber.rows.length).toBeGreaterThan(0);
    for (const row of byNumber.rows) {
      expect(`${row.customer_name} ${row.order_number}`).toContain("123456");
    }
    const byName = await listPage(
      { ...defaultQuery(ORDERS_GRID_DEF), search: "zanele dlam" },
      50,
    );
    expect(byName.rows.length).toBeGreaterThan(0);
    for (const row of byName.rows) {
      expect(String(row.customer_name).toLowerCase()).toContain("zanele dlam");
    }
  }, 30_000);
});

describe("search with equality filters", () => {
  const searching = (
    search: string,
    equals: QueryState["equals"],
  ): QueryState => ({ ...defaultQuery(ORDERS_GRID_DEF), search, equals });

  test("the filters narrow the matches, and the count is the live count under the limit", async () => {
    const query = searching("mokoena", { status_code: ["failed"] });
    const page = await listPage(query, 50);
    expect(page.rows.length).toBeGreaterThan(0);
    expect(page.hasNext).toBe(false);
    for (const row of page.rows) {
      expect(row.status_code).toBe("failed");
      expect(String(row.customer_name).toLowerCase()).toContain("mokoena");
    }
    const real = await client.query<{ rows: number }>(
      "SELECT count(*)::float8 AS rows FROM orders WHERE status_code = 'failed' AND customer_name ILIKE '%mokoena%'",
    );
    expect(page.rows.length).toBe(real.rows[0].rows);
    const count = await getGridCount(ORDERS_GRID_DEF, execute, query, false);
    expect(count).toEqual({
      count: real.rows[0].rows,
      capped: false,
      source: "capped",
    });
  }, 60_000);

  test("several values, an empty value and two fields no index pairs all combine with the search", async () => {
    const several = await listPage(
      searching("smith", { status_code: ["paid", "pending"] }),
      50,
    );
    expect(several.rows.length).toBeGreaterThan(0);
    for (const row of several.rows) {
      expect(["paid", "pending"]).toContain(String(row.status_code));
    }
    const unassigned = await listPage(
      searching("smith", { assignee: [EMPTY_VALUE] }),
      50,
    );
    expect(unassigned.rows.length).toBeGreaterThan(0);
    expect(unassigned.rows.every((row) => row.assignee === null)).toBe(true);
    const paired = await listPage(
      searching("smith", { region: ["gauteng"], channel: ["web"] }),
      50,
    );
    expect(paired.rows.length).toBeGreaterThan(0);
    for (const row of paired.rows) {
      expect([row.region, row.channel]).toEqual(["gauteng", "web"]);
    }
  }, 60_000);

  test("a search over the limit is capped and unordered, with or without a filter", async () => {
    const page = await listPage(
      searching("mok", { status_code: ["completed"] }),
      50,
    );
    expect(page.rows).toHaveLength(500);
    expect(page).toMatchObject({ hasNext: true, nextCursor: null });
    const totals = await listGridTotals(
      ORDERS_GRID_DEF,
      execute,
      searching("mok", { status_code: ["completed"] }),
    );
    expect(totals.every((total) => !total.available)).toBe(true);
  }, 60_000);

  test("a range beside the search never reaches the database", () => {
    expect(() =>
      buildPageSql(
        ORDERS_GRID_DEF,
        {
          ...searching("smith", {}),
          ranges: [{ field: "created_at", min: "2026-01-01", max: null }],
        },
        50,
      ),
    ).toThrow(QueryRejected);
  });
});

describe("the narrowed-set tier", () => {
  const base = defaultQuery(ORDERS_GRID_DEF);
  const failed: QueryState = { ...base, equals: { status_code: ["failed"] } };

  async function countWhere(where: string): Promise<number> {
    const { rows } = await client.query<{ rows: number }>(
      `SELECT count(*)::float8 AS rows FROM orders WHERE ${where}`,
    );
    return rows[0].rows;
  }

  test("a range off the sort, a second range and a contains filter the narrowed rows", async () => {
    const query: QueryState = {
      ...failed,
      ranges: [
        { field: "total", min: "20000", max: "90000" },
        { field: "item_count", min: "2", max: null },
      ],
      texts: [{ field: "note", op: "contains", value: "GIFT" }],
    };
    const page = await listGridPage(ORDERS_GRID_DEF, execute, query, 200);
    expect(page.rows.length).toBeGreaterThan(0);
    for (const row of page.rows) {
      expect(row.status_code).toBe("failed");
      expect(Number(row.total)).toBeGreaterThanOrEqual(20000);
      expect(Number(row.total)).toBeLessThanOrEqual(90000);
      expect(Number(row.item_count)).toBeGreaterThanOrEqual(2);
      expect(String(row.note).toLowerCase()).toContain("gift");
    }
    const sorted = [...page.rows].sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at)),
    );
    expect(page.rows.map((row) => row.id)).toEqual(sorted.map((row) => row.id));
    const count = await getGridCount(ORDERS_GRID_DEF, execute, query, true);
    expect(count.count).toBe(
      await countWhere(
        "status_code = 'failed' AND total BETWEEN 20000 AND 90000 AND item_count >= 2 AND note ILIKE '%gift%'",
      ),
    );
    expect(page.rows).toHaveLength(Math.min(count.count, 200));
  }, 60_000);

  test("match any is the union of its filters, paged by keyset", async () => {
    const query: QueryState = {
      ...base,
      match: "any",
      equals: { status_code: ["failed"], channel: ["phone"] },
    };
    const first = await listGridPage(ORDERS_GRID_DEF, execute, query, 100);
    const second = await listGridPage(
      ORDERS_GRID_DEF,
      execute,
      { ...query, cursor: first.nextCursor },
      100,
    );
    const rows = [...first.rows, ...second.rows];
    expect(new Set(rows.map((row) => row.id)).size).toBe(200);
    for (const row of rows) {
      expect(row.status_code === "failed" || row.channel === "phone").toBe(
        true,
      );
    }
    expect(rows.some((row) => row.status_code !== "failed")).toBe(true);
    expect(rows.some((row) => row.channel !== "phone")).toBe(true);
    const count = await getGridCount(ORDERS_GRID_DEF, execute, query, true);
    expect(count.count).toBe(
      await countWhere("status_code = 'failed' OR channel = 'phone'"),
    );
  }, 60_000);

  test("the sizes are the core's count and the sum of the terms", async () => {
    const sizes = await getNarrowedSizes(ORDERS_GRID_DEF, execute, {
      ...base,
      equals: { status_code: ["failed"], channel: ["phone"] },
    });
    const failedRows = await countWhere("status_code = 'failed'");
    const phoneRows = await countWhere("channel = 'phone'");
    expect(sizes.limit).toBe(DEFAULT_LIMITS.narrowLimit);
    expect(sizes.all).toEqual({
      rows: await countWhere("status_code = 'failed' AND channel = 'phone'"),
      over: false,
      capped: false,
    });
    expect(sizes.any).toEqual({
      rows: failedRows + phoneRows,
      over: false,
      capped: false,
    });
    const whole = await getNarrowedSizes(ORDERS_GRID_DEF, execute, base);
    expect(whole.all).toEqual({
      rows: await countWhere("true"),
      over: true,
      capped: false,
    });
    expect(whole.any).toBeNull();
  }, 60_000);

  test("over the limit an expensive operation is refused before its statement runs", async () => {
    const seen: string[] = [];
    const recording: SqlExecutor = async <T extends object>(sql: SqlQuery) => {
      seen.push(sql.text);
      return execute<T>(sql);
    };
    const cases: QueryState[] = [
      {
        ...base,
        texts: [{ field: "note", op: "contains", value: "fragile" }],
      },
      { ...base, ranges: [{ field: "total", min: "20000", max: null }] },
      {
        ...base,
        match: "any",
        equals: { status_code: ["completed"], region: ["gauteng"] },
      },
    ];
    for (const query of cases) {
      seen.length = 0;
      let refusal: unknown = null;
      try {
        await listGridPage(ORDERS_GRID_DEF, recording, query, 50);
      } catch (error) {
        refusal = error;
      }
      expect(refusal).toMatchObject({
        code: "narrow_first",
        params: { limit: DEFAULT_LIMITS.narrowLimit },
      });
      expect(seen.every((text) => !text.includes("ORDER BY"))).toBe(true);
    }
  }, 60_000);

  test("a host that raises the limit runs the same query", async () => {
    const query: QueryState = {
      ...base,
      equals: { status_code: ["completed"] },
      texts: [{ field: "note", op: "contains", value: "fragile" }],
    };
    let refusal: unknown = null;
    try {
      await listGridPage(ORDERS_GRID_DEF, execute, query, 20);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toMatchObject({ code: "narrow_first" });
    const page = await listGridPage(
      ORDERS_GRID_DEF,
      execute,
      query,
      20,
      undefined,
      { ...DEFAULT_LIMITS, narrowLimit: 1_000_000 },
    );
    expect(page.rows).toHaveLength(20);
    for (const row of page.rows) {
      expect(String(row.note).toLowerCase()).toContain("fragile");
    }
  }, 60_000);
});

describe("grouping", () => {
  const base = defaultQuery(ORDERS_GRID_DEF);

  interface Grouped {
    value: string | null;
    rows: number;
    sum: number;
    items: number;
  }

  async function groupWhere(field: string, where: string): Promise<Grouped[]> {
    const { rows } = await client.query<Grouped>(
      `SELECT ${field}::text AS value, count(*)::float8 AS rows, sum(total)::float8 AS sum, sum(item_count)::float8 AS items FROM orders WHERE ${where} GROUP BY ${field}`,
    );
    return rows;
  }

  test("by the counted field the headers are the counter table: every count and both sums", async () => {
    const result = await listGridGroups(ORDERS_GRID_DEF, execute, {
      ...base,
      group: "status_code",
    });
    expect(result.source).toBe("counter");
    const real = await groupWhere("status_code", "true");
    expect(result.groups).toHaveLength(real.length);
    for (const group of result.groups) {
      const match = real.find((row) => row.value === group.value)!;
      expect(group).toEqual({
        value: match.value!,
        label: null,
        count: match.rows,
        capped: false,
        sums: { total: match.sum, item_count: match.items },
      });
    }
  }, 60_000);

  test("by the counted field under another filter the headers are capped live counts", async () => {
    const result = await listGridGroups(ORDERS_GRID_DEF, execute, {
      ...base,
      group: "status_code",
      equals: { region: ["windhoek"] },
    });
    expect(result.source).toBe("capped");
    const real = await groupWhere("status_code", "region = 'windhoek'");
    expect(result.groups).toHaveLength(real.length);
    for (const group of result.groups) {
      const match = real.find((row) => row.value === group.value)!;
      expect(group.sums).toBeNull();
      expect(group.count).toBe(Math.min(match.rows, 10_000));
      expect(group.capped).toBe(match.rows > 10_000);
    }
  }, 60_000);

  test("by another field over a narrowed set it is one live GROUP BY, with an empty group", async () => {
    const result = await listGridGroups(ORDERS_GRID_DEF, execute, {
      ...base,
      group: "assignee",
      ranges: [
        {
          field: "created_at",
          min: new Date(Date.now() - 30 * 86_400_000).toISOString(),
          max: null,
        },
      ],
    });
    expect(result).toMatchObject({ source: "live", truncated: false });
    const real = await groupWhere(
      "assignee",
      "created_at >= now() - interval '30 days'",
    );
    expect(result.groups).toHaveLength(real.length);
    const empty = result.groups.find((group) => group.value === EMPTY_VALUE)!;
    const realEmpty = real.find((row) => row.value === null)!;
    expect(Math.abs(empty.count - realEmpty.rows)).toBeLessThan(50);
    expect(empty.sums).not.toBeNull();
    const counts = result.groups.map((group) => group.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  }, 60_000);

  test("a lookup field reads each group's label in the same statement", async () => {
    const result = await listGridGroups(ORDERS_GRID_DEF, execute, {
      ...base,
      group: "customer_id",
      ranges: [
        {
          field: "created_at",
          min: new Date(Date.now() - 10 * 86_400_000).toISOString(),
          max: null,
        },
      ],
    });
    expect(result.source).toBe("live");
    expect(result.groups.length).toBeGreaterThan(0);
    expect(result.groups.length).toBeLessThanOrEqual(200);
    for (const group of result.groups.slice(0, 20)) {
      expect(group.label).toMatch(/\S/);
      expect(group.value).toMatch(/^[0-9a-f-]{36}$/);
    }
  }, 60_000);

  test("over the limit a field other than the counted one is refused", async () => {
    let refusal: unknown = null;
    try {
      await listGridGroups(ORDERS_GRID_DEF, execute, {
        ...base,
        group: "region",
      });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toMatchObject({
      code: "narrow_first",
      params: { rows: 620_000, limit: DEFAULT_LIMITS.narrowLimit },
    });
  }, 60_000);

  test("the rows of one group are the ordinary keyset page with that value added", async () => {
    const query: QueryState = {
      ...base,
      group: "region",
      equals: { status_code: ["failed"] },
    };
    const headers = await listGridGroups(ORDERS_GRID_DEF, execute, query);
    const [largest] = headers.groups;
    const page = await listGridPage(
      ORDERS_GRID_DEF,
      execute,
      getGroupQuery(query, largest.value),
      1000,
    );
    expect(page.rows).toHaveLength(largest.count);
    for (const row of page.rows) {
      expect(row.region).toBe(largest.value);
      expect(row.status_code).toBe("failed");
    }
    expect(headers.groups.reduce((sum, group) => sum + group.count, 0)).toBe(
      (
        await getGridCount(
          ORDERS_GRID_DEF,
          execute,
          { ...query, group: null },
          true,
        )
      ).count,
    );
  }, 60_000);
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
         SELECT -g, 'pending', $1, $2, 'gauteng', 'web', 1000 * g, g FROM generate_series(1, 5) g
         RETURNING id`,
        [customer.rows[0].id, customer.rows[0].name],
      );
      const ids = inserted.rows.map((row) => row.id);
      const afterInsert = await readCounters();
      expect(afterInsert.pending).toEqual({
        rows: before.pending.rows + 5,
        sum: before.pending.sum + 15_000,
        items: before.pending.items + 15,
      });

      await client.query(
        "UPDATE orders SET status_code = 'paid' WHERE order_number IN (-1, -2)",
      );
      const afterMove = await readCounters();
      expect(afterMove.pending).toEqual({
        rows: before.pending.rows + 3,
        sum: before.pending.sum + 12_000,
        items: before.pending.items + 12,
      });
      expect(afterMove.paid).toEqual({
        rows: before.paid.rows + 2,
        sum: before.paid.sum + 3000,
        items: before.paid.items + 3,
      });

      await client.query(
        "UPDATE orders SET total = total + 500 WHERE order_number = -5",
      );
      const afterAmount = await readCounters();
      expect(afterAmount.pending).toEqual({
        rows: before.pending.rows + 3,
        sum: before.pending.sum + 12_500,
        items: before.pending.items + 12,
      });

      await client.query(
        "UPDATE orders SET item_count = item_count + 7 WHERE order_number = -3",
      );
      const afterItems = await readCounters();
      expect(afterItems.pending).toEqual({
        rows: before.pending.rows + 3,
        sum: before.pending.sum + 12_500,
        items: before.pending.items + 19,
      });

      await client.query(
        "UPDATE orders SET status_code = 'cancelled', total = 1 WHERE order_number = -4",
      );
      const afterBoth = await readCounters();
      expect(afterBoth.pending.sum).toBe(before.pending.sum + 8500);
      expect(afterBoth.pending.items).toBe(before.pending.items + 15);
      expect(afterBoth.cancelled).toEqual({
        rows: before.cancelled.rows + 1,
        sum: before.cancelled.sum + 1,
        items: before.cancelled.items + 4,
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

const SUMS =
  "count(*)::float8 AS rows, sum(total)::float8 AS sum, sum(item_count)::float8 AS items";

function totalsOf(counter: Counter, source: "counter" | "live"): TotalResult[] {
  return [
    {
      field: "total",
      available: true,
      sum: counter.sum,
      rows: counter.rows,
      source,
    },
    {
      field: "item_count",
      available: true,
      sum: counter.items,
      rows: counter.rows,
      source,
    },
  ];
}

describe("totals", () => {
  const base = defaultQuery(ORDERS_GRID_DEF);

  test("a status grouping is a one-row read of the counter table, for every total", async () => {
    const totals = await listGridTotals(ORDERS_GRID_DEF, execute, {
      ...base,
      equals: { status_code: ["failed"] },
    });
    const real = await client.query<Counter>(
      `SELECT ${SUMS} FROM orders WHERE status_code = 'failed'`,
    );
    expect(totals).toEqual(totalsOf(real.rows[0], "counter"));
  }, 60_000);

  test("a result under the cap is summed live, every total in one statement", async () => {
    const customer = await client.query<{ customer_id: string }>(
      "SELECT customer_id FROM orders ORDER BY created_at LIMIT 1",
    );
    const id = customer.rows[0].customer_id;
    const totals = await listGridTotals(ORDERS_GRID_DEF, execute, {
      ...base,
      equals: { customer_id: [id] },
    });
    const real = await client.query<Counter>(
      `SELECT ${SUMS} FROM orders WHERE customer_id = $1`,
      [id],
    );
    expect(totals).toEqual(totalsOf(real.rows[0], "live"));
  }, 60_000);

  test("a result over the cap has no total for any field, each with the reason", async () => {
    const totals = await listGridTotals(ORDERS_GRID_DEF, execute, {
      ...base,
      equals: { channel: ["web"] },
    });
    const refused = { code: "over_cap", params: { cap: 10000 } };
    expect(totals).toEqual([
      { field: "total", available: false, ...refused },
      { field: "item_count", available: false, ...refused },
    ]);
  }, 60_000);
});

describe("several values of one field", () => {
  const base = defaultQuery(ORDERS_GRID_DEF);

  test("a page under ANY holds exactly the rows of those values, in keyset order", async () => {
    const query: QueryState = {
      ...base,
      equals: { status_code: ["failed", "refunded"] },
    };
    const first = await listPage(query, 100);
    const second = await listPage({ ...query, cursor: first.nextCursor }, 100);
    const paged = [...first.rows, ...second.rows];
    const real = await client.query<{ id: string }>(
      "SELECT id FROM orders WHERE status_code IN ('failed', 'refunded') ORDER BY created_at DESC, id DESC LIMIT 200",
    );
    expect(paged.map((row) => row.id)).toEqual(real.rows.map((row) => row.id));
    expect(new Set(paged.map((row) => row.status_code))).toEqual(
      new Set(["failed", "refunded"]),
    );
  }, 60_000);

  test("several facet values count and total as the sum of their counters", async () => {
    const query: QueryState = {
      ...base,
      equals: { status_code: ["failed", "refunded"] },
    };
    const real = await client.query<Counter>(
      `SELECT ${SUMS} FROM orders WHERE status_code IN ('failed', 'refunded')`,
    );
    expect(await getGridCount(ORDERS_GRID_DEF, execute, query, false)).toEqual({
      count: real.rows[0].rows,
      capped: false,
      source: "counter",
    });
    expect(await listGridTotals(ORDERS_GRID_DEF, execute, query)).toEqual(
      totalsOf(real.rows[0], "counter"),
    );
  }, 60_000);

  test("several lookup values are one array parameter", async () => {
    const customers = await client.query<{ customer_id: string }>(
      "SELECT DISTINCT customer_id FROM (SELECT customer_id FROM orders LIMIT 500) sample LIMIT 3",
    );
    const ids = customers.rows.map((row) => row.customer_id);
    const query: QueryState = { ...base, equals: { customer_id: ids } };
    const sql = buildPageSql(ORDERS_GRID_DEF, query, 50);
    expect(sql.values).toEqual([ids]);
    const page = await listPage(query, 50);
    expect(page.rows.length).toBeGreaterThan(0);
    for (const row of page.rows) {
      expect(ids).toContain(String(row.customer_id));
    }
    const count = await getGridCount(ORDERS_GRID_DEF, execute, query, false);
    const real = await client.query<{ rows: number }>(
      "SELECT count(*)::float8 AS rows FROM orders WHERE customer_id = ANY($1::uuid[])",
      [ids],
    );
    expect(count.count).toBe(real.rows[0].rows);
  }, 60_000);

  test("more values than the field's cap never reach the database", () => {
    const ids = Array.from(
      { length: 21 },
      (_, index) =>
        `00000000-0000-7000-8000-${String(index).padStart(12, "0")}`,
    );
    const query: QueryState = { ...base, equals: { customer_id: ids } };
    let refusal: unknown = null;
    try {
      buildPageSql(ORDERS_GRID_DEF, query, 50);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toMatchObject({
      code: "too_many_values",
      params: { field: "customer_id", max: 20 },
    });
  });
});

describe("empty values", () => {
  const withAssignee = (...values: string[]): QueryState => ({
    ...defaultQuery(ORDERS_GRID_DEF),
    equals: { assignee: values },
  });

  async function countWhere(where: string): Promise<number> {
    const { rows } = await client.query<{ rows: number }>(
      `SELECT count(*)::float8 AS rows FROM orders WHERE ${where}`,
    );
    return rows[0].rows;
  }

  test("empty reads only the rows with no value, in keyset order", async () => {
    const page = await listPage(withAssignee(EMPTY_VALUE), 50);
    expect(page.rows).toHaveLength(50);
    expect(page.rows.every((row) => row.assignee === null)).toBe(true);
    const next = await listPage(
      { ...withAssignee(EMPTY_VALUE), cursor: page.nextCursor },
      50,
    );
    expect(
      String(next.rows[0].created_at) <= String(page.rows[49].created_at),
    ).toBe(true);
  });

  test("not empty reads only the rows with a value", async () => {
    const page = await listPage(withAssignee(NOT_EMPTY_VALUE), 50);
    expect(page.rows).toHaveLength(50);
    expect(page.rows.every((row) => row.assignee !== null)).toBe(true);
  });

  test("empty and not empty count every row between them", async () => {
    const empty = await getGridCount(
      ORDERS_GRID_DEF,
      execute,
      withAssignee(EMPTY_VALUE),
      true,
    );
    const filled = await getGridCount(
      ORDERS_GRID_DEF,
      execute,
      withAssignee(NOT_EMPTY_VALUE),
      true,
    );
    expect(empty.count).toBe(await countWhere("assignee IS NULL"));
    expect(empty.count + filled.count).toBe(await countWhere("true"));
  }, 60_000);

  test("empty beside a real value is the union of the two", async () => {
    const query = withAssignee(EMPTY_VALUE, "wanjiru");
    const page = await listPage(query, 200);
    expect(
      page.rows.every(
        (row) => row.assignee === null || row.assignee === "wanjiru",
      ),
    ).toBe(true);
    const count = await getGridCount(ORDERS_GRID_DEF, execute, query, true);
    expect(count.count).toBe(
      await countWhere("assignee IS NULL OR assignee = 'wanjiru'"),
    );
  }, 60_000);

  test("not empty beside a value never reaches the database", () => {
    expect(() =>
      buildPageSql(ORDERS_GRID_DEF, withAssignee(NOT_EMPTY_VALUE, "glen"), 50),
    ).toThrow(QueryRejected);
  });
});
