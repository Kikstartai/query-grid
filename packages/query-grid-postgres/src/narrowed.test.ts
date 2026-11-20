import { describe, expect, test } from "bun:test";

import {
  defaultQuery,
  DEFAULT_LIMITS,
  type Filter,
  type NarrowedResult,
  type QueryState,
} from "@kikstart/query-grid";
import type { ErrorBody } from "@kikstart/query-grid/http";

import { encodeCursor } from "./cursor.ts";
import { TEST_DEF } from "./grid-def.fixture.ts";
import { createGridHandler } from "./grid-handler.ts";
import {
  getGridCount,
  getNarrowedSizes,
  listGridPage,
  listGridTotals,
  type SqlExecutor,
} from "./query-runner.ts";
import {
  buildCappedCountSql,
  buildPageSql,
  isTotalOrdered,
  QueryRejected,
  type SqlQuery,
} from "./sql-builder.ts";
import type { PostgresGridDef } from "./storage.ts";

const BASE = defaultQuery(TEST_DEF);
const OPEN: QueryState = {
  ...BASE,
  filters: [{ field: "status", op: "any_of", values: ["open"] }],
};
const LIMITS = { ...DEFAULT_LIMITS, narrowLimit: 50 };

interface Call {
  sql: SqlQuery;
  settings: string[] | undefined;
}

function counting(answer: (sql: SqlQuery) => object[]) {
  const calls: Call[] = [];
  const execute: SqlExecutor = async <T extends object>(
    sql: SqlQuery,
    settings?: string[],
  ) => {
    calls.push({ sql, settings });
    return answer(sql) as T[];
  };
  return { calls, execute };
}

function isProbe(sql: SqlQuery): boolean {
  return sql.text.startsWith("SELECT count(*)::int AS count FROM (SELECT 1");
}

describe("the SQL of the expensive operations", () => {
  test("a range off the sort and a second range are plain AND clauses over the index order", () => {
    const sql = buildPageSql(
      TEST_DEF,
      {
        ...BASE,
        filters: [
          { field: "status", op: "any_of", values: ["open"] },
          { field: "total", op: "between", min: "100", max: "900" },
          { field: "number", op: "less_or_equal", value: "7" },
        ],
      },
      50,
    );
    expect(sql.text).toContain(
      "WHERE t.status = $1::text AND t.total >= $2::bigint AND t.total <= $3::bigint AND t.number <= $4::bigint ORDER BY t.created_at DESC, t.id DESC LIMIT 51",
    );
    expect(sql.values).toEqual(["open", "100", "900", "7"]);
  });

  test("contains is one ILIKE on its own column, with the wildcards of the value escaped", () => {
    const sql = buildCappedCountSql(TEST_DEF, {
      ...BASE,
      filters: [
        { field: "status", op: "any_of", values: ["open"] },
        { field: "note", op: "contains", value: " 50%_off " },
      ],
    });
    expect(sql.text).toContain(
      "WHERE t.status = $1::text AND t.note ILIKE $2 LIMIT",
    );
    expect(sql.values).toEqual(["open", "%50\\%\\_off%"]);
  });

  test("match any is one OR group, a two-sided range bracketed inside it, and the cursor still ANDs", () => {
    const either: QueryState = {
      ...BASE,
      combine: "or",
      filters: [
        { field: "status", op: "any_of", values: ["open"] },
        { field: "region", op: "any_of", values: ["north", "south"] },
        { field: "total", op: "between", min: "100", max: "900" },
      ],
    };
    const sql = buildPageSql(TEST_DEF, either, 50);
    expect(sql.text).toContain(
      "FROM things t WHERE (t.status = $1::text OR t.region = ANY($2::text[]) OR (t.total >= $3::bigint AND t.total <= $4::bigint)) OFFSET 0) t ORDER BY t.created_at DESC, t.id DESC LIMIT 51",
    );
    expect(sql.text).toStartWith("SELECT t.id, ");
    const next = buildPageSql(
      TEST_DEF,
      {
        ...either,
        cursor: encodeCursor({
          sortValues: ["2026-01-01T00:00:00.000000Z"],
          id: "018f4b5e-0000-7000-8000-000000000001",
        }),
      },
      50,
    );
    expect(next.text).toContain(
      "OFFSET 0) t WHERE (t.created_at, t.id) < ($5::timestamptz, $6::uuid) ORDER BY",
    );
    const first = buildPageSql(TEST_DEF, either, 1);
    expect(first.text).toEndWith("LIMIT 2");
    const one = buildPageSql(TEST_DEF, { ...OPEN, combine: "or" }, 50);
    expect(one.text).toContain("WHERE t.status = $1::text ORDER BY");
  });

  test("an expensive part on a field of the wrong kind never becomes SQL", () => {
    expect(() =>
      buildPageSql(
        TEST_DEF,
        {
          ...BASE,
          filters: [
            { field: "status", op: "any_of", values: ["open"] },
            { field: "status", op: "contains", value: "op" },
          ],
        },
        50,
      ),
    ).toThrow(QueryRejected);
    expect(() =>
      buildPageSql(
        TEST_DEF,
        {
          ...BASE,
          filters: [
            { field: "status", op: "any_of", values: ["open"] },
            { field: "name", op: "greater_or_equal", value: "a" },
          ],
        },
        50,
      ),
    ).toThrow(QueryRejected);
  });
});

describe("the narrowed-set limit on the server", () => {
  const narrowed: QueryState = {
    ...BASE,
    filters: [
      { field: "region", op: "any_of", values: ["north"] },
      { field: "note", op: "contains", value: "gift" },
    ],
  };

  test("a narrowed query first counts its core up to the limit, then runs without a Seq Scan", async () => {
    const { calls, execute } = counting((sql) =>
      isProbe(sql) ? [{ count: 12 }] : [],
    );
    const page = await listGridPage(
      TEST_DEF,
      execute,
      narrowed,
      20,
      undefined,
      LIMITS,
    );
    expect(page.rows).toEqual([]);
    expect(calls).toHaveLength(2);
    expect(calls[0].sql.text).toContain(
      "WHERE t.region = $1::text LIMIT 51) capped",
    );
    expect(calls[0].sql.text).not.toContain("ILIKE");
    expect(calls[1].sql.text).toContain("t.note ILIKE $2");
    expect(calls[1].settings).toEqual(["enable_seqscan = off"]);
  });

  test("over the limit the page, the count and the totals are refused with the size", async () => {
    const { calls, execute } = counting(() => [{ count: 51 }]);
    const runs = [
      () => listGridPage(TEST_DEF, execute, narrowed, 20, undefined, LIMITS),
      () => getGridCount(TEST_DEF, execute, narrowed, false, undefined, LIMITS),
      () => getGridCount(TEST_DEF, execute, narrowed, true, undefined, LIMITS),
      () => listGridTotals(TEST_DEF, execute, narrowed, undefined, LIMITS),
    ];
    for (const run of runs) {
      let refusal: unknown = null;
      try {
        await run();
      } catch (error) {
        refusal = error;
      }
      expect(refusal).toMatchObject({
        error: "narrow_first",
        code: "narrow_first",
        params: { rows: 50, limit: 50 },
      });
    }
    expect(calls).toHaveLength(4);
    expect(calls.every((call) => isProbe(call.sql))).toBe(true);
  });

  test("an indexed query is never probed", async () => {
    const { calls, execute } = counting(() => []);
    await listGridPage(
      TEST_DEF,
      execute,
      {
        ...BASE,
        filters: [{ field: "region", op: "any_of", values: ["north"] }],
      },
      20,
      undefined,
      LIMITS,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].settings).toBeUndefined();
  });

  test("a core on the facet alone is sized from the counter table", async () => {
    const { calls, execute } = counting(() => [
      { value: "open", count: 30, total_sum: 0, number_sum: 0 },
      { value: "done", count: 900, total_sum: 0, number_sum: 0 },
    ]);
    const query: QueryState = {
      ...BASE,
      filters: [
        { field: "status", op: "any_of", values: ["open"] },
        { field: "note", op: "contains", value: "gift" },
      ],
    };
    await listGridPage(TEST_DEF, execute, query, 20, undefined, LIMITS);
    expect(calls[0].sql.text).toContain("FROM thing_status_counts");
    expect(calls).toHaveLength(2);
  });

  test("match any sums the count of each term, each through its own index", async () => {
    const either: QueryState = {
      ...BASE,
      combine: "or",
      filters: [
        { field: "region", op: "any_of", values: ["north"] },
        { field: "total", op: "greater_or_equal", value: "100" },
      ],
    };
    const sizes = [20, 25];
    const { calls, execute } = counting((sql) =>
      isProbe(sql) ? [{ count: sizes.shift() }] : [],
    );
    await listGridPage(TEST_DEF, execute, either, 20, undefined, LIMITS);
    expect(calls).toHaveLength(3);
    expect(calls[0].sql.text).toContain("WHERE t.region = $1::text LIMIT 51");
    expect(calls[1].sql.text).toContain("WHERE t.total >= $1::bigint LIMIT 51");
    expect(calls[2].sql.text).toContain(
      "WHERE (t.region = $1::text OR t.total >= $2::bigint) OFFSET 0) t ORDER BY",
    );
    const over = counting((sql) => (isProbe(sql) ? [{ count: 30 }] : []));
    let refusal: unknown = null;
    try {
      await listGridPage(TEST_DEF, over.execute, either, 20, undefined, LIMITS);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toMatchObject({
      code: "narrow_first",
      params: { rows: 60, limit: 50 },
    });
  });

  test("match any with a term no index counts is sized by the whole table", async () => {
    const either: QueryState = {
      ...BASE,
      combine: "or",
      filters: [
        { field: "region", op: "any_of", values: ["north"] },
        { field: "note", op: "contains", value: "gift" },
      ],
    };
    const { calls, execute } = counting(() => [
      { value: "open", count: 30, total_sum: 0, number_sum: 0 },
    ]);
    await listGridPage(TEST_DEF, execute, either, 20, undefined, LIMITS);
    expect(calls[0].sql.text).toContain("FROM thing_status_counts");
    expect(calls[1].sql.text).toContain(
      "WHERE (t.region = $1::text OR t.note ILIKE $2) OFFSET 0) t ORDER BY",
    );
  });
});

describe("/narrowed", () => {
  const ORIGIN = "http://grid.test";

  function serve(count: number) {
    const { calls, execute } = counting((sql) =>
      isProbe(sql)
        ? [{ count }]
        : [{ value: "open", count: 400, total_sum: 0, number_sum: 0 }],
    );
    const handler = createGridHandler({
      def: TEST_DEF,
      execute,
      basePath: "/api/things",
      limits: { narrowLimit: 50 },
    });
    return {
      calls,
      get: (path: string) =>
        handler(new Request(`${ORIGIN}/api/things${path}`)),
    };
  }

  test("it answers the size the current filters leave, capped at the limit", async () => {
    const { get, calls } = serve(12);
    const response = await get("/narrowed?f.region.any_of=north");
    expect(await response.json()).toEqual({
      limit: 50,
      and: { rows: 12, over: false, capped: false },
      or: null,
    } satisfies NarrowedResult);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql.text).toContain("LIMIT 51");
  });

  test("with two filters it also answers what match any would run over", async () => {
    const { get } = serve(30);
    const response = await get(
      "/narrowed?f.region.any_of=north&f.total.greater_or_equal=100",
    );
    expect(await response.json()).toEqual({
      limit: 50,
      and: { rows: 30, over: false, capped: false },
      or: { rows: 60, over: true, capped: false },
    });
  });

  test("the unfiltered table is sized exactly from the counter table", async () => {
    const { get } = serve(0);
    const response = await get("/narrowed");
    expect(await response.json()).toEqual({
      limit: 50,
      and: { rows: 400, over: true, capped: false },
      or: null,
    });
  });

  test("a refused page says narrow_first as a 400 with its params", async () => {
    const { get } = serve(51);
    const response = await get("?f.region.any_of=north&f.note.contains=gift");
    expect(response.status).toBe(400);
    expect((await response.json()) as ErrorBody).toMatchObject({
      error: "narrow_first",
      code: "narrow_first",
      params: { rows: 50, limit: 50 },
    });
  });

  test("the sizes ignore the search and the contains text, which do not change the set", async () => {
    const { get, calls } = serve(5);
    await get("/narrowed?f.region.any_of=north&f.note.contains=gift");
    expect(calls[0].sql.text).not.toContain("ILIKE");
    expect(calls[0].sql.values).toEqual(["north"]);
  });
});

describe("getNarrowedSizes", () => {
  test("a grouped query is sized by its filters alone", async () => {
    const { calls, execute } = counting(() => [{ count: 10 }]);
    const sizes = await getNarrowedSizes(
      TEST_DEF,
      execute,
      {
        ...BASE,
        group: "region",
        filters: [
          { field: "region", op: "any_of", values: ["north"] },
          { field: "total", op: "greater_or_equal", value: "100" },
        ],
      },
      undefined,
      LIMITS,
    );
    expect(sizes.and).toEqual({ rows: 10, over: false, capped: false });
    expect(sizes.or).toEqual({ rows: 20, over: false, capped: false });
    expect(calls).toHaveLength(3);
  });

  test("a query that match all cannot run still sizes match any", async () => {
    const { execute } = counting((sql) =>
      isProbe(sql)
        ? [{ count: 10 }]
        : [{ value: "open", count: 400, total_sum: 0, number_sum: 0 }],
    );
    const sizes = await getNarrowedSizes(
      TEST_DEF,
      execute,
      {
        ...BASE,
        combine: "or",
        filters: [
          { field: "status", op: "any_of", values: ["open"] },
          { field: "region", op: "any_of", values: ["north"] },
        ],
      },
      undefined,
      LIMITS,
    );
    expect(sizes).toEqual({
      limit: 50,
      and: { rows: 400, over: true, capped: false },
      or: { rows: 410, over: true, capped: false },
    });
  });
});

describe("the capped total and the order it is read in", () => {
  const def: PostgresGridDef = {
    ...TEST_DEF,
    fields: TEST_DEF.fields.map((field) =>
      field.key === "region" ? { ...field, nullable: true } : field,
    ),
    indexes: [...TEST_DEF.indexes, { equals: ["note"], sort: "created_at" }],
  };
  const settingsOf = async (query: QueryState) => {
    const { calls, execute } = counting((sql) =>
      isProbe(sql)
        ? [{ count: 1 }]
        : [{ count: 1, total_sum: 1, number_sum: 1 }],
    );
    await listGridTotals(def, execute, query, undefined, LIMITS);
    return calls[calls.length - 1];
  };

  test("one plain value, or blank alone, is summed over its index in sort order", async () => {
    const cases: Filter[][] = [
      [{ field: "region", op: "any_of", values: ["north"] }],
      [{ field: "note", op: "blank" }],
    ];
    for (const filters of cases) {
      const query = { ...BASE, filters };
      expect(isTotalOrdered(def, query)).toBe(true);
      const call = await settingsOf(query);
      expect(call.sql.text).toContain(
        "ORDER BY t.created_at, t.id LIMIT 10001",
      );
      expect(call.settings).toEqual(["enable_sort = off"]);
    }
  });

  test("several values, not blank, blank beside a value and match any are capped unordered, so no sort index is walked to its end", async () => {
    const cases: QueryState[] = [
      {
        ...BASE,
        filters: [
          { field: "region", op: "any_of", values: ["north", "south"] },
        ],
      },
      { ...BASE, filters: [{ field: "note", op: "not_blank" }] },
      {
        ...BASE,
        filters: [{ field: "region", op: "any_of", values: [null, "north"] }],
      },
      {
        ...BASE,
        combine: "or",
        filters: [
          { field: "region", op: "any_of", values: ["north"] },
          { field: "total", op: "greater_or_equal", value: "100" },
        ],
      },
    ];
    for (const query of cases) {
      expect(isTotalOrdered(def, query)).toBe(false);
      const call = await settingsOf(query);
      expect(call.sql.text).not.toContain("ORDER BY");
      expect(call.sql.text).toContain("LIMIT 10001) capped");
      expect(call.settings ?? []).not.toContain("enable_sort = off");
    }
  });
});
