import { describe, expect, test } from "bun:test";

import {
  defaultQuery,
  type GridRow,
  type QueryState,
  type SortDirection,
} from "@kikstart/query-grid";

import { decodeCursor, encodeCursor } from "./cursor.ts";
import { TEST_DEF } from "./grid-def.fixture.ts";
import { validateGridDef } from "./index-defs.ts";
import { listGridPage, type SqlExecutor } from "./query-runner.ts";
import { listIndexDdl, listMissingIndexes } from "./schema-ddl.ts";
import {
  buildCappedTotalSql,
  buildPageSql,
  QueryRejected,
  toPageResult,
  type SqlQuery,
} from "./sql-builder.ts";
import type { PostgresGridDef } from "./storage.ts";

const DEF: PostgresGridDef = {
  ...TEST_DEF,
  indexes: [
    ...TEST_DEF.indexes,
    { equals: [], sort: "number", then: ["total"] },
    { equals: ["region"], sort: "number", then: ["total"], range: true },
  ],
};
const BASE = defaultQuery(DEF);
const ID = "018f4b5e-0000-7000-8000-000000000001";

function sorted(
  sorts: [string, SortDirection][],
  query: QueryState = BASE,
): QueryState {
  const [sort, ...thenBy] = sorts.map(([field, direction]) => ({
    field,
    direction,
  }));
  return { ...query, sort, thenBy: thenBy.length > 0 ? thenBy : undefined };
}

describe("a composite order an index declares", () => {
  const query = sorted([
    ["number", "desc"],
    ["total", "desc"],
  ]);

  test("orders by every column and then the key, all one way", () => {
    const sql = buildPageSql(DEF, query, 50);
    expect(sql.text).toEndWith(
      "FROM things t ORDER BY t.number DESC, t.total DESC, t.id DESC LIMIT 51",
    );
  });

  test("pages by one row comparison over the whole sort key", () => {
    const cursor = encodeCursor({ sortValues: ["7", "1200"], id: ID });
    const sql = buildPageSql(DEF, { ...query, cursor }, 50);
    expect(sql.text).toContain(
      "WHERE (t.number, t.total, t.id) < ($1::bigint, $2::bigint, $3::uuid) ORDER BY",
    );
    expect(sql.values).toEqual(["7", "1200", ID]);
  });

  test("the next cursor holds every sort value of the last row", () => {
    const rows: GridRow[] = [
      { id: ID, number: 7, total: 1200 },
      { id: ID.replace(/1$/, "2"), number: 7, total: 900 },
      { id: ID.replace(/1$/, "3"), number: 6, total: 100 },
    ];
    const page = toPageResult(DEF, query, rows, 2);
    expect(page.hasNext).toBe(true);
    expect(decodeCursor(page.nextCursor ?? "")).toEqual({
      sortValues: ["7", "900"],
      id: rows[1].id,
    });
  });

  test("a cursor of the wrong length or with a bad value is refused", () => {
    const short = encodeCursor({ sortValues: ["7"], id: ID });
    const bad = encodeCursor({ sortValues: ["7", "abc"], id: ID });
    for (const cursor of [short, bad]) {
      expect(() => buildPageSql(DEF, { ...query, cursor }, 50)).toThrow(
        QueryRejected,
      );
    }
  });

  test("a cursor takes a number as the server printed it", () => {
    const def: PostgresGridDef = {
      ...DEF,
      fields: [...DEF.fields, { key: "rate", label: "Rate", type: "decimal" }],
    };
    const byRate = sorted([
      ["created_at", "desc"],
      ["rate", "desc"],
      ["name", "desc"],
    ]);
    const cursor = encodeCursor({
      sortValues: ["2026-01-01T00:00:00.000000Z", "1e-7", ""],
      id: ID,
    });
    const sql = buildPageSql(def, { ...byRate, cursor }, 20);
    expect(sql.values).toEqual(["2026-01-01T00:00:00.000000Z", "1e-7", "", ID]);
    const bad = encodeCursor({
      sortValues: ["2026-01-01T00:00:00.000000Z", "1e-7; DROP", ""],
      id: ID,
    });
    expect(() => buildPageSql(def, { ...byRate, cursor: bad }, 20)).toThrow(
      QueryRejected,
    );
  });

  test("runs with no size probe: it is no narrowed query", async () => {
    const seen: SqlQuery[] = [];
    const execute: SqlExecutor = async (sql) => {
      seen.push(sql);
      return [];
    };
    await listGridPage(DEF, execute, query, 50);
    expect(seen).toHaveLength(1);
  });

  test("the live total walks the composite index in its own order", () => {
    const filtered = sorted(
      [
        ["number", "asc"],
        ["total", "asc"],
      ],
      { ...BASE, equals: { region: ["north"] } },
    );
    expect(buildCappedTotalSql(DEF, filtered).text).toContain(
      "ORDER BY t.number, t.total, t.id LIMIT",
    );
  });
});

describe("a further sort column with no index", () => {
  const query = sorted([
    ["created_at", "desc"],
    ["total", "asc"],
    ["name", "asc"],
  ]);

  test("orders each column its own way, with the key after the first", () => {
    expect(buildPageSql(DEF, query, 20).text).toEndWith(
      "ORDER BY t.created_at DESC, t.total ASC, t.name ASC, t.id DESC LIMIT 21",
    );
  });

  test("mixed directions page by a spelled-out keyset", () => {
    const cursor = encodeCursor({
      sortValues: ["2026-01-01T00:00:00.000000Z", "500", "it's"],
      id: ID,
    });
    const sql = buildPageSql(DEF, { ...query, cursor }, 20);
    expect(sql.text).toContain(
      "WHERE t.created_at <= $1::timestamptz AND (t.created_at < $1::timestamptz OR (t.created_at = $1::timestamptz AND (t.total > $2::bigint OR (t.total = $2::bigint AND (t.name > $3::text OR (t.name = $3::text AND t.id < $4::uuid))))))",
    );
    expect(sql.values).toEqual([
      "2026-01-01T00:00:00.000000Z",
      "500",
      "it's",
      ID,
    ]);
  });

  test("the core is counted first and the page refused past the limit", async () => {
    const seen: SqlQuery[] = [];
    const execute: SqlExecutor = async <T extends object>(sql: SqlQuery) => {
      seen.push(sql);
      const counters = sql.text.includes("thing_status_counts");
      return (counters ? [{ value: "open", count: 6 }] : []) as T[];
    };
    await listGridPage(DEF, execute, query, 20, undefined, {
      pageLimit: 200,
      countCap: 10_000,
      searchLimit: 500,
      searchBudgetMs: 120,
      narrowLimit: 5,
      exportLimit: 50_000,
    }).then(
      () => {
        throw new Error("expected a refusal");
      },
      (error: unknown) => {
        expect(error).toBeInstanceOf(QueryRejected);
        expect((error as QueryRejected).code).toBe("narrow_first");
      },
    );
    expect(seen).toHaveLength(1);
    expect(seen[0].text).toContain("thing_status_counts");
  });

  test("a nullable column is refused before any SQL", () => {
    const nullable = sorted([
      ["created_at", "desc"],
      ["note", "asc"],
    ]);
    expect(() => buildPageSql(DEF, nullable, 20)).toThrow(QueryRejected);
  });
});

describe("the def and the DDL of a composite order", () => {
  test("the index is built over the equality, the order and the key", () => {
    const names = listIndexDdl(DEF).map((index) => index.ddl);
    expect(names).toContain(
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_things_number__total ON things USING btree (number, total, id);",
    );
    expect(names).toContain(
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_things_region__number__total ON things USING btree (region, number, total, id);",
    );
  });

  test("pg_indexes answers it by its columns in order", () => {
    const missing = listMissingIndexes(DEF, [
      {
        indexname: "x",
        indexdef:
          "CREATE INDEX x ON public.things USING btree (number, total, id)",
      },
    ]).map((index) => index.name);
    expect(missing).not.toContain("auto_things_number__total");
    expect(missing).toContain("auto_things_region__number__total");
  });

  test("a bad order is named", () => {
    expect(validateGridDef(DEF)).toEqual([]);
    const problems = validateGridDef({
      ...DEF,
      indexes: [
        ...TEST_DEF.indexes,
        { equals: [], sort: "number", then: ["note", "nope", "number"] },
        { equals: ["region"], sort: "number", then: ["region", "total"] },
        {
          equals: [],
          sort: "total",
          then: ["number", "name", "status", "status"],
        },
      ],
    }).join("\n");
    expect(problems).toContain("a nullable field cannot be a keyset sort");
    expect(problems).toContain("unknown sort field nope");
    expect(problems).toContain(
      "number is already an equality, the sort or the key",
    );
    expect(problems).toContain(
      "region is already an equality, the sort or the key",
    );
    expect(problems).toContain("status is sorted on twice");
    expect(problems).toContain("an order has at most 3 columns");
  });
});
