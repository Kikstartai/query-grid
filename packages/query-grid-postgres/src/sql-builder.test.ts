import { describe, expect, test } from "bun:test";

import {
  type Filter,
  type GridRow,
  type QueryState,
  type TotalResult,
} from "@kikstart/query-grid";

import { TEST_DEF } from "./grid-def.fixture.ts";
import { decodeCursor, encodeCursor } from "./cursor.ts";
import {
  getGridCount,
  listGridTotals,
  walkGridPages,
  type SqlExecutor,
} from "./query-runner.ts";
import {
  generateGridMigration,
  listCounterObjects,
  listGridMigrationSteps,
  listMissingIndexes,
  listIndexDdl,
  listTableMigrations,
  validateGridDefs,
} from "./schema-ddl.ts";
import {
  buildCappedCountSql,
  buildCappedTotalSql,
  buildExactCountSql,
  buildFacetSql,
  buildPageSql,
  IDENTIFIER_MAX_LENGTH,
  QueryRejected,
  shortenIdentifier,
  toPageResult,
  type SqlQuery,
} from "./sql-builder.ts";
import type { PostgresGridDef } from "./storage.ts";

const BASE: QueryState = {
  filters: [],
  group: null,
  combine: "and",
  search: null,
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
      filters: [{ field: "status", op: "any_of", values: ["open"] }],
      sort: BY_TOTAL,
      cursor: encodeCursor({ sortValues: ["1200"], id: ID }),
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
        sortValues: ["2026-01-01T00:00:00.000000Z"],
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
      filters: [
        { field: "status", op: "any_of", values: ["open", "done"] },
        { field: "region", op: "any_of", values: ["north"] },
      ],
    };
    const page = buildPageSql(
      {
        ...TEST_DEF,
        indexes: [{ equals: ["status", "region"], sort: "created_at" }],
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
      filters: [{ field: "status", op: "any_of", values: ["open", "done"] }],
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
      filters: [{ field: "status", op: "any_of", values: ["open", "done"] }],
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

  test("an index that opts out of several values refuses them", () => {
    const single = {
      ...TEST_DEF,
      indexes: [{ equals: ["status"], sort: "created_at", multi: false }],
    };
    expect(() =>
      buildPageSql(
        single,
        {
          ...BASE,
          filters: [
            { field: "status", op: "any_of", values: ["open", "done"] },
          ],
        },
        10,
      ),
    ).toThrow(QueryRejected);
    expect(
      buildPageSql(
        single,
        {
          ...BASE,
          filters: [{ field: "status", op: "any_of", values: ["open"] }],
        },
        10,
      ).values,
    ).toEqual(["open"]);
  });

  test("a range bounds the sort column", () => {
    const query: QueryState = {
      ...BASE,
      filters: [
        {
          field: "created_at",
          op: "between",
          min: "2026-01-01T00:00:00Z",
          max: "2026-02-01T00:00:00Z",
        },
      ],
    };
    expect(buildPageSql(TEST_DEF, query, 10).text).toContain(
      "WHERE t.created_at >= $1::timestamptz AND t.created_at <= $2::timestamptz ORDER BY",
    );
  });

  test("the search is an unordered capped ILIKE over the joined columns", () => {
    const query: QueryState = { ...BASE, search: " 50%_off " };
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

  test("an unindexed query is rejected", () => {
    const query: QueryState = {
      ...BASE,
      filters: [{ field: "region", op: "any_of", values: ["north"] }],
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
        {
          ...BASE,
          filters: [{ field: "status", op: "any_of", values: ["x' OR 1=1"] }],
        },
        10,
      ),
    ).toThrow(QueryRejected);
    expect(() =>
      buildPageSql(TEST_DEF, { ...BASE, cursor: "garbage" }, 10),
    ).toThrow(QueryRejected);
    for (const forged of [
      encodeCursor({ sortValues: ["not a date"], id: ID }),
      encodeCursor({ sortValues: ["2026-01-01T00:00:00Z"], id: "not-a-uuid" }),
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

  test("the live totals sum every total field inside the same cap", () => {
    const query: QueryState = {
      ...BASE,
      filters: [{ field: "region", op: "any_of", values: ["north"] }],
    };
    expect(buildCappedTotalSql(TEST_DEF, query)).toEqual({
      text: "SELECT count(*)::int AS count, coalesce(sum(capped.total), 0)::float8 AS total_sum, coalesce(sum(capped.number), 0)::float8 AS number_sum FROM (SELECT t.total, t.number FROM things t WHERE t.region = $1::text ORDER BY t.created_at, t.id LIMIT 10001) capped",
      values: ["north"],
    });
    expect(() =>
      buildCappedTotalSql({ ...TEST_DEF, totals: undefined }, query),
    ).toThrow("no totals");
  });

  const counters = [
    { value: "open", count: 30, total_sum: 9000, number_sum: 30300 },
    { value: "done", count: 10, total_sum: 1000, number_sum: 10100 },
  ];
  const fromCounters: TotalResult[] = [
    {
      field: "total",
      available: true,
      sum: 10000,
      rows: 40,
      source: "counter",
    },
    {
      field: "number",
      available: true,
      sum: 40400,
      rows: 40,
      source: "counter",
    },
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

  test("a status grouping reads its count and totals from the counter table", async () => {
    const { execute, seen } = recordingExecutor(counters);
    const query: QueryState = {
      ...BASE,
      filters: [{ field: "status", op: "any_of", values: ["open"] }],
    };
    expect(await getGridCount(TEST_DEF, execute, query, false)).toEqual({
      count: 30,
      capped: false,
      source: "counter",
    });
    expect(await listGridTotals(TEST_DEF, execute, BASE)).toEqual(fromCounters);
    expect(await listGridTotals(TEST_DEF, execute, query)).toEqual([
      {
        field: "total",
        available: true,
        sum: 9000,
        rows: 30,
        source: "counter",
      },
      {
        field: "number",
        available: true,
        sum: 30300,
        rows: 30,
        source: "counter",
      },
    ]);
    expect(seen[0].text).toBe(
      "SELECT status AS value, row_count::float8 AS count, total_sum::float8 AS total_sum, number_sum::float8 AS number_sum FROM thing_status_counts",
    );
    expect(buildFacetSql({ ...TEST_DEF, totals: undefined })?.text).toBe(
      "SELECT status AS value, row_count::float8 AS count FROM thing_status_counts",
    );
  });

  test("several facet values read the sum of their counters", async () => {
    const { execute } = recordingExecutor(counters);
    const query: QueryState = {
      ...BASE,
      filters: [{ field: "status", op: "any_of", values: ["open", "done"] }],
    };
    expect(await getGridCount(TEST_DEF, execute, query, false)).toEqual({
      count: 40,
      capped: false,
      source: "counter",
    });
    expect(await listGridTotals(TEST_DEF, execute, query)).toEqual(
      fromCounters,
    );
  });

  test("another filter totals live under the cap and is refused above it", async () => {
    const query: QueryState = {
      ...BASE,
      filters: [{ field: "region", op: "any_of", values: ["north"] }],
    };
    const under = recordingExecutor([
      { count: 812, total_sum: 55500, number_sum: 900 },
    ]);
    expect(await listGridTotals(TEST_DEF, under.execute, query)).toEqual([
      {
        field: "total",
        available: true,
        sum: 55500,
        rows: 812,
        source: "live",
      },
      { field: "number", available: true, sum: 900, rows: 812, source: "live" },
    ]);
    expect(under.settings).toEqual([["enable_sort = off"]]);
    const over = recordingExecutor([
      { count: 10001, total_sum: 1, number_sum: 1 },
    ]);
    const refused = { code: "over_cap", params: { cap: 10000 } };
    expect(await listGridTotals(TEST_DEF, over.execute, query)).toEqual([
      { field: "total", available: false, ...refused },
      { field: "number", available: false, ...refused },
    ]);
  });

  test("a grid without totals answers none and reads nothing", async () => {
    const { execute, seen } = recordingExecutor([]);
    const bare = { ...TEST_DEF, totals: undefined };
    expect(await listGridTotals(bare, execute, BASE)).toEqual([]);
    expect(seen).toEqual([]);
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
      sortValues: [row(2).created_at as string],
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
  test("each index def is one CREATE INDEX, built without blocking writes", () => {
    expect(listIndexDdl(TEST_DEF).map((index) => index.ddl)).toEqual([
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_things_created_at ON things USING btree (created_at, id);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_things_total ON things USING btree (total, id);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_things_status__created_at ON things USING btree (status, created_at, id);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_things_status__total ON things USING btree (status, total, id);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_things_region__created_at ON things USING btree (region, created_at, id);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_things_search ON things USING gin ((name || ' ' || number::text) gin_trgm_ops);",
    ]);
    expect(listIndexDdl(TEST_DEF, { concurrently: false })[0].ddl).toBe(
      "CREATE INDEX IF NOT EXISTS auto_things_created_at ON things USING btree (created_at, id);",
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

  test("each index is marked auto-created right after it is built", () => {
    const steps = listGridMigrationSteps(TEST_DEF);
    const names = listIndexDdl(TEST_DEF).map((index) => index.name);
    for (const name of names) {
      const built = steps.findIndex((step) =>
        step.sql.includes(`EXISTS ${name} ON`),
      );
      expect(steps[built + 1]).toMatchObject({
        sql: `COMMENT ON INDEX ${name} IS 'Auto-created.';`,
        transaction: false,
      });
    }
  });

  test("the counter is backfilled from one snapshot, with no lock held across the scan, and stays current meanwhile", () => {
    const steps = listGridMigrationSteps(TEST_DEF).filter(
      (step) => step.transaction,
    );
    expect(steps).toHaveLength(3);
    const [install, backfill, switchOver] = steps.map((step) => step.sql);
    expect(install).toContain(
      "CREATE TABLE IF NOT EXISTS thing_status_counts (status text PRIMARY KEY, row_count bigint NOT NULL DEFAULT 0);",
    );
    expect(install).toStartWith(
      "BEGIN;\nLOCK TABLE things IN SHARE ROW EXCLUSIVE MODE;\nCREATE TABLE IF NOT EXISTS thing_status_counts",
    );
    expect(install).toContain(
      "ALTER TABLE thing_status_counts ADD COLUMN IF NOT EXISTS total_sum bigint NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS number_sum bigint NOT NULL DEFAULT 0;",
    );
    expect(install).toContain(
      "DROP TABLE IF EXISTS thing_status_counts_pending;\nCREATE TABLE thing_status_counts_pending (status text NOT NULL, row_count bigint NOT NULL, total_sum bigint NOT NULL, number_sum bigint NOT NULL);",
    );
    expect(install).toContain(
      "DROP FUNCTION IF EXISTS thing_status_counts_bump(text, bigint, bigint);",
    );
    expect(install.match(/LOCK TABLE/g)).toHaveLength(1);
    expect(install).toContain(
      "thing_status_counts_bump(p_value text, p_rows bigint, p_sums bigint[])",
    );
    const bumpCounter =
      "INSERT INTO thing_status_counts (status, row_count, total_sum, number_sum) VALUES (p_value, p_rows, p_sums[1], p_sums[2])\n  ON CONFLICT (status) DO UPDATE SET row_count = thing_status_counts.row_count + EXCLUDED.row_count, total_sum = thing_status_counts.total_sum + EXCLUDED.total_sum, number_sum = thing_status_counts.number_sum + EXCLUDED.number_sum;";
    expect(install).toContain(
      `${bumpCounter}\n  INSERT INTO thing_status_counts_pending (status, row_count, total_sum, number_sum) VALUES (p_value, p_rows, p_sums[1], p_sums[2]);\n$$;`,
    );
    expect(install).toContain(
      "PERFORM thing_status_counts_bump(OLD.status, -1, ARRAY[-OLD.total, -OLD.number]::bigint[]);",
    );
    expect(install).toContain(
      "PERFORM thing_status_counts_bump(NEW.status, 1, ARRAY[NEW.total, NEW.number]::bigint[]);",
    );
    expect(install).toContain(
      "CREATE TRIGGER thing_status_counts_on_update AFTER UPDATE OF status, total, number ON things FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.total IS DISTINCT FROM NEW.total OR OLD.number IS DISTINCT FROM NEW.number) EXECUTE FUNCTION thing_status_counts_on_update();",
    );
    expect(backfill).toStartWith("BEGIN ISOLATION LEVEL REPEATABLE READ;");
    expect(backfill).not.toContain("LOCK TABLE");
    expect(backfill).toContain(
      "SELECT status, count(*), coalesce(sum(total), 0), coalesce(sum(number), 0) FROM things GROUP BY status",
    );
    expect(backfill).toContain("DELETE FROM thing_status_counts_pending;");
    expect(backfill).toContain(
      "INSERT INTO thing_status_counts_pending (status, row_count, total_sum, number_sum)\n    SELECT status, count(*)",
    );
    expect(backfill).not.toContain("UPDATE thing_status_counts ");
    expect(switchOver).toContain(
      "SELECT status, sum(row_count), sum(total_sum), sum(number_sum) FROM thing_status_counts_pending GROUP BY status",
    );
    expect(switchOver).toContain(
      "ON CONFLICT (status) DO UPDATE SET row_count = EXCLUDED.row_count, total_sum = EXCLUDED.total_sum, number_sum = EXCLUDED.number_sum;",
    );
    expect(switchOver).toContain(`${bumpCounter}\n$bump$;`);
    expect(switchOver).toContain("DROP TABLE thing_status_counts_pending;");
    const skip =
      "IF to_regclass('thing_status_counts_pending') IS NULL THEN\n    RETURN;";
    expect(backfill).toContain(skip);
    expect(switchOver).toContain(skip);
    expect(switchOver).toContain(
      "IF obj_description(to_regclass('thing_status_counts_pending'), 'pg_class') IS DISTINCT FROM 'backfilled' THEN\n    RAISE EXCEPTION",
    );
    const migration = generateGridMigration(TEST_DEF);
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm;");
    expect(migration.match(/LOCK TABLE/g)).toHaveLength(2);
    expect(listCounterObjects(TEST_DEF)).toEqual({
      table: "thing_status_counts",
      pending: "thing_status_counts_pending",
      columns: ["status", "row_count", "total_sum", "number_sum"],
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
    const wide: PostgresGridDef = {
      ...TEST_DEF,
      table: long,
      facet: undefined,
      search: undefined,
      indexes: [
        { equals: [], sort: "created_at" },
        { equals: ["status", "region"], sort: "created_at" },
        { equals: ["status", "region"], sort: "total" },
      ],
    };
    const names = listIndexDdl(wide).map((index) => index.name);
    expect(names[0]).toBe(`auto_${long}_created_at`);
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
    const other: PostgresGridDef = {
      ...TEST_DEF,
      id: "things-by-region",
      facet: undefined,
      indexes: [
        { equals: [], sort: "created_at", range: true },
        { equals: ["region"], sort: "total" },
      ],
    };
    const widgets: PostgresGridDef = {
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
        /CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_things_created_at /g,
      ),
    ).toHaveLength(1);
    expect(things.sql).toContain("auto_things_region__total");
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
        { ...TEST_DEF, id: "things-untotalled", totals: undefined },
      ]),
    ).toEqual([
      "things-untotalled: counter table thing_status_counts is declared with two definitions",
    ]);
    expect(
      validateGridDefs([
        { ...other, indexes: [{ equals: [], sort: "total" }] },
      ]),
    ).toEqual([
      "things-by-region: the default sort with no filter is not a declared index",
    ]);
  });

  test("an index missing from pg_indexes is reported", () => {
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
    ).toEqual(["auto_things_status__created_at"]);
    const withoutSearch = rows.slice(0, -1).concat({
      indexname: "name_only",
      indexdef:
        "CREATE INDEX name_only ON public.things USING gin (name gin_trgm_ops)",
    });
    expect(
      listMissingIndexes(TEST_DEF, withoutSearch).map((index) => index.name),
    ).toEqual(["auto_things_status__created_at", "auto_things_search"]);
  });

  test("an index left invalid by a failed concurrent build counts as missing", () => {
    const rows = [
      {
        indexname: "auto_things_created_at",
        indexdef:
          "CREATE INDEX auto_things_created_at ON public.things USING btree (created_at, id)",
        valid: false,
      },
    ];
    expect(
      listMissingIndexes(TEST_DEF, rows).map((index) => index.name),
    ).toContain("auto_things_created_at");
    expect(
      listMissingIndexes(TEST_DEF, [{ ...rows[0], valid: true }]).map(
        (index) => index.name,
      ),
    ).not.toContain("auto_things_created_at");
  });
});

describe("an exact count of a search", () => {
  test("runs under the search budget and is refused past it", async () => {
    const applied: (string[] | undefined)[] = [];
    const canceled: SqlExecutor = async (_sql, settings) => {
      applied.push(settings);
      throw Object.assign(new Error("canceling statement"), { code: "57014" });
    };
    await expect(
      getGridCount(TEST_DEF, canceled, { ...BASE, search: "---" }, true),
    ).rejects.toMatchObject({ code: "too_broad" });
    expect(applied).toEqual([
      ["enable_seqscan = off", "statement_timeout = 120"],
    ]);
  });
});

describe("blank values", () => {
  const def: PostgresGridDef = {
    ...TEST_DEF,
    fields: TEST_DEF.fields.map((field) =>
      field.key === "region" ? { ...field, nullable: true } : field,
    ),
    indexes: [...TEST_DEF.indexes, { equals: ["note"], sort: "created_at" }],
  };
  const withFilter = (filter: Filter): QueryState => ({
    ...BASE,
    filters: [filter],
  });

  test("blank is IS NULL and takes no parameter", () => {
    const sql = buildPageSql(
      def,
      withFilter({ field: "note", op: "blank" }),
      50,
    );
    expect(sql.text).toContain("WHERE t.note IS NULL ORDER BY");
    expect(sql.values).toEqual([]);
  });

  test("not blank is IS NOT NULL", () => {
    const sql = buildCappedCountSql(
      def,
      withFilter({ field: "note", op: "not_blank" }),
    );
    expect(sql.text).toContain("WHERE t.note IS NOT NULL LIMIT");
    expect(sql.values).toEqual([]);
  });

  test("blank beside real values is one OR group, so the other filters still AND", () => {
    const one = buildPageSql(
      def,
      withFilter({ field: "region", op: "any_of", values: [null, "north"] }),
      50,
    );
    expect(one.text).toContain(
      "WHERE (t.region = $1::text OR t.region IS NULL)",
    );
    expect(one.values).toEqual(["north"]);
    const two = buildPageSql(
      def,
      withFilter({
        field: "region",
        op: "any_of",
        values: ["north", null, "south"],
      }),
      50,
    );
    expect(two.text).toContain(
      "WHERE (t.region = ANY($1::text[]) OR t.region IS NULL)",
    );
    expect(two.values).toEqual([["north", "south"]]);
  });

  test("blank on a field that is never blank is refused", () => {
    expect(() =>
      buildPageSql(def, withFilter({ field: "status", op: "blank" }), 50),
    ).toThrow(QueryRejected);
    expect(() =>
      buildPageSql(
        def,
        withFilter({ field: "status", op: "any_of", values: [null] }),
        50,
      ),
    ).toThrow(QueryRejected);
  });
});

describe("the SQL of each operator", () => {
  const OWNER = "018f4b5e-0000-7000-8000-0000000000aa";
  const def: PostgresGridDef = {
    ...TEST_DEF,
    fields: [
      ...TEST_DEF.fields,
      {
        key: "owner",
        label: "Owner",
        type: "id",
        nullable: true,
        lookup: { labelField: "name" },
      },
      { key: "tags", label: "Tags", type: "array", nullable: true },
      { key: "labels", label: "Labels", type: "array" },
      { key: "due", label: "Due", type: "date" },
      {
        key: "kind",
        label: "Kind",
        type: "enum",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      },
    ],
    indexes: [
      ...TEST_DEF.indexes,
      { equals: ["owner"], sort: "created_at" },
      { equals: [], sort: "due", range: true },
    ],
    arrayIndexes: ["tags", "labels"],
  };

  function where(...filters: Filter[]): SqlQuery {
    const sql = buildCappedCountSql(def, { ...BASE, filters });
    const match = /WHERE (.*) LIMIT \d+\) capped$/.exec(sql.text);
    return { text: match ? match[1] : sql.text, values: sql.values };
  }

  function refusal(...filters: Filter[]): unknown {
    try {
      buildPageSql(def, { ...BASE, filters }, 10);
    } catch (error) {
      return error;
    }
    return null;
  }

  test("blank and not blank take no parameter, and an array is blank when empty too", () => {
    expect(where({ field: "note", op: "blank" })).toEqual({
      text: "t.note IS NULL",
      values: [],
    });
    expect(where({ field: "note", op: "not_blank" })).toEqual({
      text: "t.note IS NOT NULL",
      values: [],
    });
    expect(where({ field: "tags", op: "blank" })).toEqual({
      text: "(t.tags IS NULL OR cardinality(t.tags) = 0)",
      values: [],
    });
  });

  test("none of on a lookup is one <> ALL that keeps a blank cell unless blank is excluded too", () => {
    expect(where({ field: "owner", op: "none_of", values: [OWNER] })).toEqual({
      text: "(t.owner <> ALL($1::uuid[]) OR t.owner IS NULL)",
      values: [[OWNER]],
    });
    expect(
      where({ field: "owner", op: "none_of", values: [OWNER, null] }),
    ).toEqual({ text: "t.owner <> ALL($1::uuid[])", values: [[OWNER]] });
  });

  test("text equals is one plain comparison of the trimmed value", () => {
    expect(where({ field: "name", op: "equals", value: " Ann " })).toEqual({
      text: "t.name = $1",
      values: ["Ann"],
    });
  });

  test("all of on an array is containment, none of is the negated overlap", () => {
    expect(
      where({ field: "tags", op: "all_of", values: ["gift", "rush"] }),
    ).toEqual({ text: "t.tags @> $1::text[]", values: [["gift", "rush"]] });
    expect(where({ field: "tags", op: "none_of", values: ["gift"] })).toEqual({
      text: "(NOT (t.tags && $1::text[]) OR t.tags IS NULL)",
      values: [["gift"]],
    });
  });

  test(
    "none of on an array that is never null keeps a row with an empty array",
    () => {
      expect(
        where({ field: "labels", op: "none_of", values: ["gift"] }),
      ).toEqual({ text: "NOT (t.labels && $1::text[])", values: [["gift"]] });
    },
  );

  test("number and date equals are one = comparison", () => {
    expect(where({ field: "total", op: "equals", value: "500" })).toEqual({
      text: "t.total = $1::bigint",
      values: ["500"],
    });
    expect(where({ field: "due", op: "equals", value: "2026-03-03" })).toEqual({
      text: "t.due = $1::date",
      values: ["2026-03-03"],
    });
  });

  test("a datetime equal to a day is bounded by the first and last instants of the day", () => {
    expect(
      where({ field: "created_at", op: "equals", value: "2026-03-03" }),
    ).toEqual({
      text: "t.created_at >= $1::timestamptz AND t.created_at <= $2::timestamptz",
      values: ["2026-03-03T00:00:00.000000Z", "2026-03-03T23:59:59.999999Z"],
    });
  });

  test("an operator the field does not take is refused with its code", () => {
    expect(
      refusal({ field: "status", op: "contains", value: "op" }),
    ).toMatchObject({
      error: "invalid_value",
      code: "invalid_op",
      params: { field: "status", op: "contains" },
    });
  });

  test("a period and an exclusion over fixed values must be literal by the time they reach the server", () => {
    expect(
      refusal({ field: "created_at", op: "in_period", preset: "last-7-days" }),
    ).toMatchObject({
      error: "invalid_value",
      code: "literal_required",
      params: { field: "created_at", op: "in_period" },
    });
    expect(
      refusal({ field: "status", op: "none_of", values: ["open"] }),
    ).toMatchObject({
      error: "invalid_value",
      code: "literal_required",
      params: { field: "status", op: "none_of" },
    });
  });

  test("more filters than the cap are refused with the cap", () => {
    const filters: Filter[] = Array.from({ length: 21 }, (_, at) => ({
      field: "total",
      op: "greater_or_equal",
      value: String(at),
    }));
    expect(refusal(...filters)).toMatchObject({
      error: "invalid_value",
      code: "too_many_filters",
      params: { max: 20 },
    });
  });

  test("any of on a choice field no index holds is refused as unindexed", () => {
    expect(
      refusal({ field: "kind", op: "any_of", values: ["a"] }),
    ).toMatchObject({ error: "unindexed_query", code: "unindexed_query" });
  });
});
