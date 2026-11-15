import { describe, expect, test } from "bun:test";

import {
  defaultQuery,
  DEFAULT_LIMITS,
  EMPTY_VALUE,
  type QueryState,
} from "@kikstart/query-grid";

import { TEST_DEF } from "./grid-def.fixture.ts";
import { createGridHandler } from "./grid-handler.ts";
import { listGridGroups, type SqlExecutor } from "./query-runner.ts";
import { buildGroupSql, QueryRejected, type SqlQuery } from "./sql-builder.ts";
import type { PostgresGridDef } from "./storage.ts";

const BASE = defaultQuery(TEST_DEF);
const LIMITS = { ...DEFAULT_LIMITS, narrowLimit: 50, countCap: 20 };

interface Call {
  sql: SqlQuery;
  settings: string[] | undefined;
}

function answering(answer: (sql: SqlQuery) => object[]) {
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

const COUNTERS = [
  { value: "open", count: 30, total_sum: 900, number_sum: 60 },
  { value: "done", count: 12, total_sum: 400, number_sum: 20 },
  { value: "held", count: 0, total_sum: 0, number_sum: 0 },
];

describe("buildGroupSql", () => {
  test("it groups the filtered rows by the field, with the count and every total, largest first", () => {
    const sql = buildGroupSql(TEST_DEF, {
      ...BASE,
      group: "region",
      ranges: [{ field: "total", min: "100", max: null }],
      contains: { field: "note", value: "gift" },
    });
    expect(sql.text).toBe(
      "SELECT t.region::text AS value, count(*)::float8 AS count, coalesce(sum(t.total), 0)::float8 AS total_sum, coalesce(sum(t.number), 0)::float8 AS number_sum FROM things t WHERE t.total >= $1::bigint AND t.note ILIKE $2 GROUP BY t.region ORDER BY count(*) DESC, t.region LIMIT 201",
    );
    expect(sql.values).toEqual(["100", "%gift%"]);
  });

  test("a lookup field also reads its label", () => {
    const def: PostgresGridDef = {
      ...TEST_DEF,
      fields: TEST_DEF.fields.map((field) =>
        field.key === "region"
          ? { ...field, options: undefined, lookup: { labelField: "name" } }
          : field,
      ),
    };
    const sql = buildGroupSql(def, { ...BASE, group: "region" });
    expect(sql.text).toContain(
      "SELECT t.region::text AS value, min(t.name)::text AS label, count(*)::float8 AS count",
    );
  });

  test("a field no index holds, a missing group and a group beside the search are refused", () => {
    expect(() => buildGroupSql(TEST_DEF, { ...BASE, group: "name" })).toThrow(
      QueryRejected,
    );
    expect(() => buildGroupSql(TEST_DEF, BASE)).toThrow(QueryRejected);
    expect(() =>
      buildGroupSql(TEST_DEF, { ...BASE, group: "status", search: "abc" }),
    ).toThrow(QueryRejected);
  });
});

describe("grouping by the counted field", () => {
  test("with no other filter the headers are one read of the counter table, with the sums", async () => {
    const { calls, execute } = answering(() => COUNTERS);
    const result = await listGridGroups(
      TEST_DEF,
      execute,
      { ...BASE, group: "status" },
      undefined,
      LIMITS,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].sql.text).toContain("FROM thing_status_counts");
    expect(result).toEqual({
      source: "counter",
      truncated: false,
      groups: [
        {
          value: "open",
          label: null,
          count: 30,
          capped: false,
          sums: { total: 900, number: 60 },
        },
        {
          value: "done",
          label: null,
          count: 12,
          capped: false,
          sums: { total: 400, number: 20 },
        },
      ],
    });
  });

  test("a filter on the counted field keeps only its groups", async () => {
    const { execute } = answering(() => COUNTERS);
    const result = await listGridGroups(
      TEST_DEF,
      execute,
      { ...BASE, group: "status", equals: { status: ["done"] } },
      undefined,
      LIMITS,
    );
    expect(result.groups.map((group) => group.value)).toEqual(["done"]);
  });

  test("with another filter each value is a capped live count, like the grid's own count", async () => {
    const counts = [25, 7];
    const { calls, execute } = answering(() => [{ count: counts.shift() }]);
    const query: QueryState = {
      ...BASE,
      group: "status",
      sort: { field: "total", direction: "asc" },
      ranges: [{ field: "total", min: "100", max: null }],
    };
    const result = await listGridGroups(
      TEST_DEF,
      execute,
      query,
      undefined,
      LIMITS,
    );
    expect(calls).toHaveLength(2);
    expect(calls[0].sql.text).toContain(
      "WHERE t.status = $1::text AND t.total >= $2::bigint LIMIT 21",
    );
    expect(calls.map((call) => call.sql.values[0])).toEqual(["open", "done"]);
    expect(result).toEqual({
      source: "capped",
      truncated: false,
      groups: [
        { value: "open", label: null, count: 20, capped: true, sums: null },
        { value: "done", label: null, count: 7, capped: false, sums: null },
      ],
    });
  });
});

describe("grouping by another equality field", () => {
  const byRegion: QueryState = { ...BASE, group: "region" };

  test("under the limit it is one live GROUP BY, with no Seq Scan allowed", async () => {
    const { calls, execute } = answering((sql) =>
      sql.text.includes("GROUP BY")
        ? [
            { value: "north", count: 8, total_sum: 80, number_sum: 4 },
            { value: null, count: 2, total_sum: 5, number_sum: 1 },
          ]
        : [{ value: "open", count: 10, total_sum: 0, number_sum: 0 }],
    );
    const result = await listGridGroups(
      TEST_DEF,
      execute,
      byRegion,
      undefined,
      LIMITS,
    );
    expect(calls).toHaveLength(2);
    expect(calls[0].sql.text).toContain("FROM thing_status_counts");
    expect(calls[1].settings).toEqual(["enable_seqscan = off"]);
    expect(result).toEqual({
      source: "live",
      truncated: false,
      groups: [
        {
          value: "north",
          label: null,
          count: 8,
          capped: false,
          sums: { total: 80, number: 4 },
        },
        {
          value: EMPTY_VALUE,
          label: null,
          count: 2,
          capped: false,
          sums: { total: 5, number: 1 },
        },
      ],
    });
  });

  test("over the limit it is refused before the GROUP BY runs", async () => {
    const { calls, execute } = answering(() => [
      { value: "open", count: 51, total_sum: 0, number_sum: 0 },
    ]);
    let refusal: unknown = null;
    try {
      await listGridGroups(TEST_DEF, execute, byRegion, undefined, LIMITS);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toMatchObject({
      code: "narrow_first",
      params: { rows: 51, limit: 50 },
    });
    expect(calls).toHaveLength(1);
  });

  test("more groups than the group limit are cut and flagged", async () => {
    const many = Array.from({ length: 201 }, (_, index) => ({
      value: `v${index}`,
      count: 1,
      total_sum: 0,
      number_sum: 0,
    }));
    const { execute } = answering((sql) =>
      sql.text.includes("GROUP BY") ? many : [{ count: 10 }],
    );
    const result = await listGridGroups(
      TEST_DEF,
      execute,
      { ...byRegion, equals: { region: ["north"] } },
      undefined,
      LIMITS,
    );
    expect(result.groups).toHaveLength(200);
    expect(result.truncated).toBe(true);
  });
});

describe("/groups", () => {
  test("the route answers the headers and refuses a query with no group", async () => {
    const { execute } = answering(() => COUNTERS);
    const handler = createGridHandler({
      def: TEST_DEF,
      execute,
      basePath: "/api/things",
    });
    const get = (path: string) =>
      handler(new Request(`http://grid.test/api/things${path}`));
    const response = await get("/groups?group=status");
    expect(response.status).toBe(200);
    expect(((await response.json()) as { source: string }).source).toBe(
      "counter",
    );
    expect((await get("/groups")).status).toBe(400);
    expect((await get("/groups?group=name")).status).toBe(400);
  });
});
