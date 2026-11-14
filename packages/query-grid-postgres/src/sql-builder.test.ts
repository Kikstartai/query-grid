import { describe, expect, test } from "bun:test";

import type { GridRow, QueryState } from "@kikstart/query-grid";

import { TEST_DEF } from "./grid-def.fixture.ts";
import { decodeCursor, encodeCursor } from "./cursor.ts";
import {
  getGridCount,
  getGridTotal,
  walkGridPages,
  type SqlExecutor,
} from "./query-runner.ts";
import {
  generateGridMigration,
  IDENTIFIER_MAX_LENGTH,
  listCounterObjects,
  listGridMigrationSteps,
  listMissingIndexes,
  listShapeIndexes,
  listTableMigrations,
  shortenIdentifier,
  validateGridDefs,
} from "./schema-ddl.ts";
import {
  buildCappedCountSql,
  buildCappedTotalSql,
  buildExactCountSql,
  buildPageSql,
  QueryRejected,
  toPageResult,
  type SqlQuery,
} from "./sql-builder.ts";
import type { ServerGridDef } from "./storage.ts";

const BASE: QueryState = {
  equals: {},
  range: null,
  quick: null,
  sort: TEST_DEF.defaultSort,
  cursor: null,
};
const ID = "018f4b5e-0000-7000-8000-000000000001";
const BY_TOTAL = { field: "total", direction: "asc" } as const;

describe("buildPageSql", () => {
  test("the first page orders by the sort then the key and probes one extra row", () => {
    const sql = buildPageSql(TEST_DEF, BASE, 50);
    expect(sql.text).toEndWith(
      "FROM things t ORDER BY t.created_at DESC, t.id DESC LIMIT 51",
    );
    expect(sql.text).not.toContain("OFFSET");
    expect(sql.text).toContain("t.total::float8 AS total");
    expect(sql.values).toEqual([]);
  });

  test("a cursor becomes a row comparison after the filters", () => {
    const query: QueryState = {
      ...BASE,
      equals: { status: ["open"] },
      sort: BY_TOTAL,
      cursor: encodeCursor({ sortValue: "1200", id: ID }),
    };
    const sql = buildPageSql(TEST_DEF, query, 10);
    expect(sql.text).toContain(
      "WHERE t.status = $1::text AND (t.total, t.id) > ($2::bigint, $3::uuid) ORDER BY t.total ASC, t.id ASC LIMIT 11",
    );
    expect(sql.values).toEqual(["open", "1200", ID]);
  });

  test("a descending cursor compares with less-than", () => {
    const query: QueryState = {
      ...BASE,
      cursor: encodeCursor({
        sortValue: "2026-01-01T00:00:00.000000Z",
        id: ID,
      }),
    };
    expect(buildPageSql(TEST_DEF, query, 10).text).toContain(
      "(t.created_at, t.id) < ($1::timestamptz, $2::uuid)",
    );
  });

  test("several values of one field are one array parameter under ANY", () => {
    const query: QueryState = {
      ...BASE,
      equals: { status: ["open", "done"], region: ["north"] },
    };
    const page = buildPageSql(
      {
        ...TEST_DEF,
        shapes: [{ equals: ["status", "region"], sort: "created_at" }],
      },
      query,
      10,
    );
    expect(page.text).toContain(
      "WHERE t.status = ANY($1::text[]) AND t.region = $2::text ORDER BY",
    );
    expect(page.values).toEqual([["open", "done"], "north"]);
    const count = buildCappedCountSql(TEST_DEF, {
      ...BASE,
      equals: { status: ["open", "done"] },
    });
    expect(count.text).toContain(
      "WHERE t.status = ANY($1::text[]) LIMIT 10001",
    );
    expect(count.values).toEqual([["open", "done"]]);
  });

  test("a value list past the field's cap is refused with a code", () => {
    const capped = {
      ...TEST_DEF,
      fields: TEST_DEF.fields.map((field) =>
        field.key === "status" ? { ...field, maxValues: 1 } : field,
      ),
    };
    const query: QueryState = {
      ...BASE,
      equals: { status: ["open", "done"] },
    };
    let refusal: unknown = null;
    try {
      buildPageSql(capped, query, 10);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(QueryRejected);
    expect(refusal).toMatchObject({
      error: "invalid_value",
      code: "too_many_values",
      params: { field: "status", max: 1 },
    });
  });

  test("a shape that opts out of several values refuses them", () => {
    const single = {
      ...TEST_DEF,
      shapes: [{ equals: ["status"], sort: "created_at", multi: false }],
    };
    expect(() =>
      buildPageSql(
        single,
        { ...BASE, equals: { status: ["open", "done"] } },
        10,
      ),
    ).toThrow(QueryRejected);
    expect(
      buildPageSql(single, { ...BASE, equals: { status: ["open"] } }, 10)
        .values,
    ).toEqual(["open"]);
  });

  test("a range bounds the sort column", () => {
    const query: QueryState = {
      ...BASE,
      range: { field: "created_at", min: "2026-01-01", max: "2026-02-01" },
    };
    expect(buildPageSql(TEST_DEF, query, 10).text).toContain(
      "WHERE t.created_at >= $1::timestamptz AND t.created_at <= $2::timestamptz ORDER BY",
    );
  });

  test("the quick filter is an unordered capped ILIKE over the joined columns", () => {
    const query: QueryState = { ...BASE, quick: " 50%_off " };
    const sql = buildPageSql(TEST_DEF, query, 10);
    expect(sql.text).toEndWith(
      "FROM things t WHERE (t.name || ' ' || t.number::text) ILIKE $1 LIMIT 501",
    );
    expect(sql.text).not.toContain("ORDER BY");
    expect(sql.values).toEqual(["%50\\%\\_off%"]);
  });

  test("the page size is capped per request", () => {
    expect(buildPageSql(TEST_DEF, BASE, 1_000_000).text).toEndWith(
      "LIMIT 1001",
    );
    expect(buildPageSql(TEST_DEF, BASE, Number.NaN).text).toEndWith(
      "LIMIT 201",
    );
  });

  test("an undeclared shape is rejected", () => {
    const query: QueryState = {
      ...BASE,
      equals: { region: ["north"] },
      sort: BY_TOTAL,
    };
    expect(() => buildPageSql(TEST_DEF, query, 10)).toThrow(QueryRejected);
    expect(() => buildCappedCountSql(TEST_DEF, query)).toThrow(QueryRejected);
    expect(() => buildExactCountSql(TEST_DEF, query)).toThrow(QueryRejected);
    expect(() => buildCappedTotalSql(TEST_DEF, query)).toThrow(QueryRejected);
  });

  test("an unknown field or a bad value is rejected before any SQL exists", () => {
    expect(() =>
      buildPageSql(
        TEST_DEF,
        { ...BASE, sort: { field: "id; drop", direction: "asc" } },
        10,
      ),
    ).toThrow(QueryRejected);
    expect(() =>
      buildPageSql(
        TEST_DEF,
        { ...BASE, equals: { status: ["x' OR 1=1"] } },
        10,
      ),
    ).toThrow(QueryRejected);
    expect(() =>
      buildPageSql(TEST_DEF, { ...BASE, cursor: "garbage" }, 10),
    ).toThrow(QueryRejected);
    for (const forged of [
      encodeCursor({ sortValue: "not a date", id: ID }),
      encodeCursor({ sortValue: "2026-01-01T00:00:00Z", id: "not-a-uuid" }),
    ]) {
      let refusal: unknown = null;
      try {
        buildPageSql(TEST_DEF, { ...BASE, cursor: forged }, 10);
      } catch (error) {
        refusal = error;
      }
      expect(refusal).toMatchObject({ error: "invalid_cursor" });
    }
  });
});

describe("counts and totals", () => {
  test("the capped count never scans past the cap", () => {
    expect(buildCappedCountSql(TEST_DEF, BASE).text).toBe(
      "SELECT count(*)::int AS count FROM (SELECT 1 FROM things t LIMIT 10001) capped",
    );
  });

  test("the live total sums inside the same cap", () => {
    const query: QueryState = { ...BASE, equals: { region: ["north"] } };
    expect(buildCappedTotalSql(TEST_DEF, query)).toEqual({
      text: "SELECT count(*)::int AS count, coalesce(sum(capped.amount), 0)::float8 AS sum FROM (SELECT t.total AS amount FROM things t WHERE t.region = $1::text ORDER BY t.created_at, t.id LIMIT 10001) capped",
      values: ["north"],
    });
  });

  const counters = [
    { value: "open", count: 30, sum: 9000 },
    { value: "done", count: 10, sum: 1000 },
  ];

  function recordingExecutor(rows: object[]): {
    execute: SqlExecutor;
    seen: SqlQuery[];
    settings: (string[] | undefined)[];
  } {
    const seen: SqlQuery[] = [];
    const settings: (string[] | undefined)[] = [];
    const execute: SqlExecutor = async <T extends object>(
      sql: SqlQuery,
      applied?: string[],
    ) => {
      seen.push(sql);
      settings.push(applied);
      return rows as T[];
    };
    return { execute, seen, settings };
  }

  test("a status grouping reads its count and total from the counter table", async () => {
    const { execute, seen } = recordingExecutor(counters);
    const query: QueryState = { ...BASE, equals: { status: ["open"] } };
    expect(await getGridCount(TEST_DEF, execute, query, false)).toEqual({
      count: 30,
      capped: false,
      source: "counter",
    });
    expect(await getGridTotal(TEST_DEF, execute, BASE)).toEqual({
      available: true,
      sum: 10000,
      rows: 40,
      source: "counter",
    });
    expect(seen[0].text).toBe(
      "SELECT status AS value, row_count::float8 AS count, total_sum::float8 AS sum FROM thing_status_counts",
    );
  });

  test("several facet values read the sum of their counters", async () => {
    const { execute } = recordingExecutor(counters);
    const query: QueryState = { ...BASE, equals: { status: ["open", "done"] } };
    expect(await getGridCount(TEST_DEF, execute, query, false)).toEqual({
      count: 40,
      capped: false,
      source: "counter",
    });
    expect(await getGridTotal(TEST_DEF, execute, query)).toEqual({
      available: true,
      sum: 10000,
      rows: 40,
      source: "counter",
    });
  });

  test("another filter totals live under the cap and is refused above it", async () => {
    const query: QueryState = { ...BASE, equals: { region: ["north"] } };
    const under = recordingExecutor([{ count: 812, sum: 55500 }]);
    expect(await getGridTotal(TEST_DEF, under.execute, query)).toEqual({
      available: true,
      sum: 55500,
      rows: 812,
      source: "live",
    });
    expect(under.settings).toEqual([["enable_sort = off"]]);
    const over = recordingExecutor([{ count: 10001, sum: 1 }]);
    expect(await getGridTotal(TEST_DEF, over.execute, query)).toEqual({
      available: false,
      code: "over_cap",
      params: { cap: 10000 },
    });
  });

  test("a grid without a total says so", async () => {
    const { execute } = recordingExecutor([]);
    const bare = { ...TEST_DEF, total: undefined };
    expect(await getGridTotal(bare, execute, BASE)).toEqual({
      available: false,
      code: "no_total",
      params: {},
    });
  });
});

describe("toPageResult", () => {
  const row = (n: number): GridRow => ({
    id: `${ID.slice(0, -1)}${n}`,
    created_at: `2026-01-0${n}T00:00:00.000000Z`,
  });

  test("the extra row becomes hasNext and the cursor is the last kept row", () => {
    const page = toPageResult(TEST_DEF, BASE, [row(3), row(2), row(1)], 2);
    expect(page.rows).toHaveLength(2);
    expect(page.hasNext).toBe(true);
    expect(decodeCursor(page.nextCursor!)).toEqual({
      sortValue: row(2).created_at as string,
      id: row(2).id,
    });
  });

  test("a short page ends the feed", () => {
    const page = toPageResult(TEST_DEF, BASE, [row(1)], 2);
    expect(page).toEqual({ rows: [row(1)], nextCursor: null, hasNext: false });
  });

  test("walkGridPages follows the keyset to the end", async () => {
    const all = [row(5), row(4), row(3), row(2), row(1)];
    const execute: SqlExecutor = async <T extends object>(sql: SqlQuery) => {
      const after = sql.values[1];
      const start = after ? all.findIndex((item) => item.id === after) + 1 : 0;
      return all.slice(start, start + 3) as unknown as T[];
    };
    const pages: number[] = [];
    for await (const rows of walkGridPages(TEST_DEF, execute, BASE, 2)) {
      pages.push(rows.length);
    }
    expect(pages).toEqual([2, 2, 1]);
  });
});

describe("generated DDL", () => {
  test("each shape maps to one index, built without blocking writes", () => {
    expect(listShapeIndexes(TEST_DEF).map((index) => index.ddl)).toEqual([
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS things_qs_created_at ON things USING btree (created_at, id);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS things_qs_total ON things USING btree (total, id);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS things_qs_status__created_at ON things USING btree (status, created_at, id);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS things_qs_status__total ON things USING btree (status, total, id);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS things_qs_region__created_at ON things USING btree (region, created_at, id);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS things_qs_quick ON things USING gin ((name || ' ' || number::text) gin_trgm_ops);",
    ]);
    expect(listShapeIndexes(TEST_DEF, { concurrently: false })[0].ddl).toBe(
      "CREATE INDEX IF NOT EXISTS things_qs_created_at ON things USING btree (created_at, id);",
    );
  });

  test("an index statement is never inside a transaction", () => {
    const steps = listGridMigrationSteps(TEST_DEF);
    const indexes = steps.filter((step) => step.sql.includes("CREATE INDEX"));
    expect(indexes).toHaveLength(6);
    for (const step of indexes) {
      expect(step.transaction).toBe(false);
      expect(step.sql).not.toContain("BEGIN");
      expect(step.sql.split("\n")).toHaveLength(1);
    }
  });

  test("the counter is backfilled from one snapshot, with no lock held across the scan", () => {
    const steps = listGridMigrationSteps(TEST_DEF).filter(
      (step) => step.transaction,
    );
    expect(steps).toHaveLength(3);
    const [install, backfill, switchOver] = steps.map((step) => step.sql);
    expect(install).toContain(
      "CREATE TABLE IF NOT EXISTS thing_status_counts (status text PRIMARY KEY, row_count bigint NOT NULL DEFAULT 0);",
    );
    expect(install).toContain(
      "INSERT INTO thing_status_counts_pending (status, row_count, total_sum) VALUES (p_value, p_rows, p_sum);",
    );
    expect(install).toContain(
      "PERFORM thing_status_counts_bump(OLD.status, -1, -OLD.total);",
    );
    expect(install).toContain(
      "CREATE TRIGGER thing_status_counts_on_update AFTER UPDATE OF status, total ON things FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.total IS DISTINCT FROM NEW.total) EXECUTE FUNCTION thing_status_counts_on_update();",
    );
    expect(backfill).toStartWith("BEGIN ISOLATION LEVEL REPEATABLE READ;");
    expect(backfill).not.toContain("LOCK TABLE");
    expect(backfill).toContain(
      "SELECT status, count(*), coalesce(sum(total), 0) FROM things GROUP BY status",
    );
    expect(backfill).toContain("DELETE FROM thing_status_counts_pending;");
    expect(switchOver).toContain(
      "SELECT status, sum(row_count), sum(total_sum) FROM thing_status_counts_pending GROUP BY status",
    );
    expect(switchOver).toContain(
      "ON CONFLICT (status) DO UPDATE SET row_count = thing_status_counts.row_count + EXCLUDED.row_count, total_sum = thing_status_counts.total_sum + EXCLUDED.total_sum;\n$$;",
    );
    expect(switchOver).toContain("DROP TABLE thing_status_counts_pending;");
    const migration = generateGridMigration(TEST_DEF);
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm;");
    expect(migration.match(/LOCK TABLE/g)).toHaveLength(2);
    expect(listCounterObjects(TEST_DEF)).toEqual({
      table: "thing_status_counts",
      pending: "thing_status_counts_pending",
      columns: ["status", "row_count", "total_sum"],
      functions: ["thing_status_counts_bump"],
      triggers: [
        "thing_status_counts_on_insert",
        "thing_status_counts_on_delete",
        "thing_status_counts_on_update",
      ],
    });
  });

  test("a name past 63 characters is shortened with a hash, never truncated by Postgres", () => {
    const long = "a_table_with_a_rather_long_name_for_its_rows";
    const wide: ServerGridDef = {
      ...TEST_DEF,
      table: long,
      facet: undefined,
      shapes: [
        { equals: [], sort: "created_at" },
        { equals: ["status", "region"], sort: "created_at" },
        { equals: ["status", "region"], sort: "total" },
      ],
    };
    const names = listShapeIndexes(wide).map((index) => index.name);
    expect(names[0]).toBe(`${long}_qs_created_at`);
    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(IDENTIFIER_MAX_LENGTH);
    }
    expect(names[1].length).toBe(63);
    expect(new Set(names).size).toBe(3);
    expect(names[1].slice(0, 54)).toBe(names[2].slice(0, 54));
    expect(shortenIdentifier("short")).toBe("short");
    expect(shortenIdentifier("x".repeat(64))).toBe(
      shortenIdentifier("x".repeat(64)),
    );
  });

  test("many defs give one migration per table, with shared indexes once", () => {
    const other: ServerGridDef = {
      ...TEST_DEF,
      id: "things-by-region",
      facet: undefined,
      shapes: [
        { equals: [], sort: "created_at", range: true },
        { equals: ["region"], sort: "total" },
      ],
    };
    const widgets: ServerGridDef = {
      ...TEST_DEF,
      id: "widgets",
      table: "widgets",
      facet: { field: "status", counterTable: "widget_status_counts" },
    };
    const migrations = listTableMigrations([TEST_DEF, other, widgets]);
    expect(migrations.map((migration) => migration.table)).toEqual([
      "things",
      "widgets",
    ]);
    const [things] = migrations;
    expect(
      things.sql.match(
        /CREATE INDEX CONCURRENTLY IF NOT EXISTS things_qs_created_at /g,
      ),
    ).toHaveLength(1);
    expect(things.sql).toContain("things_qs_region__total");
    expect(things.sql.match(/CREATE EXTENSION/g)).toHaveLength(1);
    expect(things.sql).not.toContain("widget");
    expect(migrations[1].sql).toContain("widget_status_counts_pending");
    expect(validateGridDefs([TEST_DEF, other, widgets])).toEqual([]);
    expect(validateGridDefs([TEST_DEF, TEST_DEF])).toEqual([
      "things: the id is used by more than one def",
    ]);
    expect(
      validateGridDefs([
        TEST_DEF,
        { ...TEST_DEF, id: "things-untotalled", total: undefined },
      ]),
    ).toEqual([
      "things-untotalled: counter table thing_status_counts is declared with two definitions",
    ]);
    expect(
      validateGridDefs([{ ...other, shapes: [{ equals: [], sort: "total" }] }]),
    ).toEqual([
      "things-by-region: the default sort with no filter is not a declared shape",
    ]);
  });

  test("a shape with no matching index is reported", () => {
    const rows = [
      "CREATE INDEX a ON public.things USING btree (created_at, id)",
      "CREATE INDEX b ON public.things USING btree (total, id)",
      "CREATE INDEX wrong_order ON public.things USING btree (created_at, status, id)",
      "CREATE INDEX partial ON public.things USING btree (status, created_at, id) WHERE (total > 0)",
      "CREATE INDEX c ON public.things USING btree (status, total, id)",
      "CREATE INDEX d ON public.things USING btree (region, created_at, id)",
      "CREATE INDEX e ON public.things USING gin ((((name || ' '::text) || (number)::text)) gin_trgm_ops)",
    ].map((indexdef, index) => ({ indexname: `i${index}`, indexdef }));
    expect(
      listMissingIndexes(TEST_DEF, rows).map((index) => index.name),
    ).toEqual(["things_qs_status__created_at"]);
    const withoutQuick = rows.slice(0, -1).concat({
      indexname: "name_only",
      indexdef:
        "CREATE INDEX name_only ON public.things USING gin (name gin_trgm_ops)",
    });
    expect(
      listMissingIndexes(TEST_DEF, withoutQuick).map((index) => index.name),
    ).toEqual(["things_qs_status__created_at", "things_qs_quick"]);
  });

  test("an index left invalid by a failed concurrent build counts as missing", () => {
    const rows = [
      {
        indexname: "things_qs_created_at",
        indexdef:
          "CREATE INDEX things_qs_created_at ON public.things USING btree (created_at, id)",
        valid: false,
      },
    ];
    expect(
      listMissingIndexes(TEST_DEF, rows).map((index) => index.name),
    ).toContain("things_qs_created_at");
    expect(
      listMissingIndexes(TEST_DEF, [{ ...rows[0], valid: true }]).map(
        (index) => index.name,
      ),
    ).not.toContain("things_qs_created_at");
  });
});

describe("an exact count of a quick filter", () => {
  test("runs under the quick budget and is refused past it", async () => {
    const applied: (string[] | undefined)[] = [];
    const canceled: SqlExecutor = async (_sql, settings) => {
      applied.push(settings);
      throw Object.assign(new Error("canceling statement"), { code: "57014" });
    };
    await expect(
      getGridCount(TEST_DEF, canceled, { ...BASE, quick: "---" }, true),
    ).rejects.toMatchObject({ code: "too_broad" });
    expect(applied).toEqual([
      ["enable_seqscan = off", "statement_timeout = 120"],
    ]);
  });
});
