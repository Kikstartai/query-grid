import { describe, expect, test } from "bun:test";

import {
  decodeQuery,
  defaultQuery,
  DEFAULT_LIMITS,
  encodeQuery,
  type Filter,
  type ValueFilter,
  type QueryState,
} from "@kikstart/query-grid";

import { validateGridDef } from "./index-defs.ts";
import {
  getGridCount,
  getNarrowedSizes,
  listGridGroups,
  listGridPage,
  listGridTotals,
  listSearchSettings,
  QUERY_CANCELED,
  type SqlExecutor,
} from "./query-runner.ts";
import {
  generateGridMigration,
  listIndexDdl,
  listMissingIndexes,
} from "./schema-ddl.ts";
import {
  buildCappedCountSql,
  buildPageSql,
  isTotalOrdered,
  QueryRejected,
  type SqlQuery,
} from "./sql-builder.ts";
import type { PostgresGridDef } from "./storage.ts";

const FOLDER = "11111111-1111-4111-8111-111111111111";

const DEF: PostgresGridDef = {
  id: "files",
  table: "files",
  defaultSort: { field: "created_at", direction: "desc" },
  totals: ["size"],
  fields: [
    { key: "id", label: "ID", type: "id" },
    { key: "name", label: "Name", type: "text" },
    { key: "note", label: "Note", type: "text", nullable: true },
    { key: "size", label: "Size", type: "integer" },
    { key: "rate", label: "Rate", type: "decimal", nullable: true },
    { key: "starred", label: "Starred", type: "boolean" },
    { key: "due", label: "Due", type: "date", nullable: true },
    { key: "created_at", label: "Created", type: "datetime" },
    { key: "deleted_at", label: "Deleted", type: "datetime", nullable: true },
    { key: "folder_id", label: "Folder", type: "id", nullable: true },
    { key: "tags", label: "Tags", type: "array", nullable: true },
    { key: "labels", label: "Labels", type: "array", nullable: true },
  ],
  indexes: [
    { filter: [], sort: ["created_at"] },
    { filter: ["starred"], sort: ["created_at"] },
    { filter: ["folder_id"], sort: ["created_at"] },
    { text: "name" },
    { array: "tags" },
  ],
};

const BASE = defaultQuery(DEF);
const LIMITS = { ...DEFAULT_LIMITS, narrowLimit: 50 };

function where(query: Partial<QueryState>): SqlQuery {
  const sql = buildCappedCountSql(DEF, { ...BASE, ...query });
  const start = sql.text.indexOf(" WHERE ") + " WHERE ".length;
  return {
    text: sql.text.slice(start, sql.text.indexOf(" LIMIT ")),
    values: sql.values,
  };
}

function text(field: string, op: ValueFilter["op"], value: string): Filter {
  return { field, op, value };
}

interface Call {
  sql: SqlQuery;
  settings: string[] | undefined;
}

function recording(answer: (sql: SqlQuery) => object[]) {
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

describe("the SQL of a range", () => {
  test("an open bound is a strict comparison", () => {
    expect(
      where({
        filters: [
          text("created_at", "greater_than", "2026-01-01T00:00:00Z"),
          text("created_at", "less_than", "2026-02-01T00:00:00Z"),
        ],
      }),
    ).toEqual({
      text: "t.created_at > $1::timestamptz AND t.created_at < $2::timestamptz",
      values: ["2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"],
    });
  });

  test("an excluded range is the two sides outside it, and keeps an empty cell", () => {
    expect(
      where({
        filters: [{ field: "rate", op: "not_between", min: "1.5", max: "2.5" }],
      }),
    ).toEqual({
      text: "(t.rate < $1::numeric OR t.rate > $2::numeric OR t.rate IS NULL)",
      values: ["1.5", "2.5"],
    });
    expect(
      where({
        filters: [text("size", "less_or_equal", "5")],
      }).text,
    ).toBe("t.size <= $1::bigint");
    expect(
      where({
        filters: [text("due", "not_equals", "2026-03-01")],
      }),
    ).toEqual({
      text: "(t.due <> $1::date OR t.due IS NULL)",
      values: ["2026-03-01"],
    });
  });

  test("two ranges on one field are two clauses", () => {
    expect(
      where({
        filters: [
          text("size", "greater_or_equal", "5"),
          text("size", "not_equals", "9"),
        ],
      }).text,
    ).toBe("t.size >= $1::bigint AND t.size <> $2::bigint");
  });
});

describe("the SQL of a text filter", () => {
  test("each operator is one comparison with the value's wildcards escaped", () => {
    expect(where({ filters: [text("note", "starts_with", "50%")] })).toEqual({
      text: "t.note ILIKE $1",
      values: ["50\\%%"],
    });
    expect(
      where({ filters: [text("note", "ends_with", "_v2")] }).values,
    ).toEqual(["%\\_v2"]);
    expect(
      where({ filters: [text("note", "contains", " gift ")] }).values,
    ).toEqual(["%gift%"]);
  });

  test("a negation keeps an empty cell on a nullable field", () => {
    expect(where({ filters: [text("note", "not_contains", "gift")] })).toEqual({
      text: "(t.note NOT ILIKE $1 OR t.note IS NULL)",
      values: ["%gift%"],
    });
    expect(
      where({ filters: [text("name", "not_contains", "gift")] }).text,
    ).toBe("t.name NOT ILIKE $1");
    expect(where({ filters: [text("note", "not_equals", "50%")] })).toEqual({
      text: "t.note IS DISTINCT FROM $1",
      values: ["50%"],
    });
  });

  test("several on one field are ANDed, or ORed under match any", () => {
    const texts = [
      text("note", "contains", "gift"),
      text("note", "not_contains", "card"),
    ];
    expect(where({ filters: texts }).text).toBe(
      "t.note ILIKE $1 AND (t.note NOT ILIKE $2 OR t.note IS NULL)",
    );
    expect(where({ filters: texts, combine: "or" }).text).toBe(
      "(t.note ILIKE $1 OR (t.note NOT ILIKE $2 OR t.note IS NULL))",
    );
  });
});

describe("the SQL of the new field types", () => {
  test("an overlap is one array parameter", () => {
    expect(
      where({
        filters: [{ field: "tags", op: "any_of", values: ["red", "blue"] }],
      }),
    ).toEqual({
      text: "t.tags && $1::text[]",
      values: [["red", "blue"]],
    });
  });

  test("a boolean is cast, and a blank is IS NULL", () => {
    expect(
      where({
        filters: [{ field: "starred", op: "any_of", values: ["true"] }],
      }),
    ).toEqual({
      text: "t.starred = $1::boolean",
      values: ["true"],
    });
    expect(
      where({
        filters: [
          { field: "folder_id", op: "any_of", values: [FOLDER] },
          { field: "deleted_at", op: "blank" },
        ],
      }).text,
    ).toBe("t.folder_id = $1::uuid AND t.deleted_at IS NULL");
  });

  test("a date is read back as its day and a decimal as a number", () => {
    const { text: sql } = buildPageSql(DEF, BASE, 10);
    expect(sql).toContain("to_char(t.due, 'YYYY-MM-DD') AS due");
    expect(sql).toContain("t.rate::float8 AS rate");
    expect(sql).toContain("t.starred, ");
    expect(sql).toContain("t.tags, t.labels FROM files t");
  });

  test("a query core encodes and decodes into the same SQL", () => {
    const query: QueryState = {
      ...BASE,
      filters: [
        { field: "starred", op: "any_of", values: ["false"] },
        { field: "size", op: "not_between", min: "1", max: "9" },
        text("due", "greater_than", "2026-01-01"),
        text("note", "ends_with", ".pdf"),
        { field: "labels", op: "any_of", values: ["a"] },
      ],
    };
    const decoded = decodeQuery(DEF, encodeQuery(DEF, query));
    expect(buildCappedCountSql(DEF, decoded)).toEqual(
      buildCappedCountSql(DEF, query),
    );
  });
});

describe("a filter with an index of its own", () => {
  const invoice = text("name", "contains", "invoice");
  const indexed = { ...BASE, filters: [invoice] };

  test("runs under the search budget with no count of a narrowed set first", async () => {
    const { calls, execute } = recording(() => []);
    await listGridPage(DEF, execute, indexed, 20, undefined, LIMITS);
    expect(calls).toHaveLength(1);
    expect(calls[0].settings).toEqual(listSearchSettings(LIMITS));
    expect(calls[0].sql.text).toContain(
      "WHERE t.name ILIKE $1 ORDER BY t.created_at DESC, t.id DESC LIMIT 21",
    );
  });

  test("is refused as too broad when the budget cancels it", async () => {
    const canceled: SqlExecutor = async () => {
      throw Object.assign(new Error("canceled"), { code: QUERY_CANCELED });
    };
    for (const run of [
      () => listGridPage(DEF, canceled, indexed, 20, undefined, LIMITS),
      () => getGridCount(DEF, canceled, indexed, false, undefined, LIMITS),
      () => listGridTotals(DEF, canceled, indexed, undefined, LIMITS),
      () =>
        listGridPage(
          DEF,
          canceled,
          {
            ...BASE,
            filters: [{ field: "tags", op: "any_of", values: ["red"] }],
          },
          20,
          undefined,
          LIMITS,
        ),
    ]) {
      const refusal = await run().catch((error: unknown) => error);
      expect(refusal).toBeInstanceOf(QueryRejected);
      expect((refusal as QueryRejected).error).toBe("too_broad");
    }
  });

  test("keeps the exact count inside the budget and its total unordered", async () => {
    const { calls, execute } = recording(() => [{ count: 3, size_sum: 9 }]);
    await getGridCount(DEF, execute, indexed, true, undefined, LIMITS);
    expect(calls[0].settings).toEqual(listSearchSettings(LIMITS));
    expect(isTotalOrdered(DEF, indexed)).toBe(false);
    expect(isTotalOrdered(DEF, BASE)).toBe(true);
    await listGridTotals(DEF, execute, indexed, undefined, LIMITS);
    expect(calls[1].sql.text).not.toContain("ORDER BY");
  });

  test("falls back to the narrowed set when its value is too short or negated", async () => {
    for (const filter of [
      text("name", "contains", "in"),
      text("name", "not_contains", "invoice"),
      text("note", "contains", "invoice"),
    ]) {
      const { calls, execute } = recording(() => [{ count: 7 }]);
      await listGridPage(
        DEF,
        execute,
        { ...BASE, filters: [filter] },
        20,
        undefined,
        LIMITS,
      );
      expect(calls).toHaveLength(2);
      expect(calls[0].sql.text).toContain("LIMIT 51) capped");
      expect(calls[1].settings).toEqual(["enable_seqscan = off"]);
    }
  });

  test("the narrowed size and a live group are sized without the text index", async () => {
    const { calls, execute } = recording(() => [{ count: 7 }]);
    const sizes = await getNarrowedSizes(
      DEF,
      execute,
      {
        ...BASE,
        filters: [
          { field: "starred", op: "any_of", values: ["true"] },
          invoice,
        ],
      },
      undefined,
      LIMITS,
    );
    expect(sizes.and).toEqual({ rows: 7, over: false, capped: false });
    expect(calls[0].sql.text).toContain("WHERE t.starred = $1::boolean LIMIT");
    expect(calls.every((call) => !call.sql.text.includes("ILIKE"))).toBe(true);
    calls.length = 0;
    await listGridGroups(
      DEF,
      execute,
      { ...indexed, group: "starred" },
      undefined,
      LIMITS,
    );
    expect(calls[0].sql.text).not.toContain("ILIKE");
    expect(calls[1].sql.text).toContain("ILIKE");
    expect(calls[1].sql.text).toContain("GROUP BY t.starred");
  });

  test("an overlap with no index is refused over the narrowed-set limit", async () => {
    const { execute } = recording(() => [{ count: 51 }]);
    const refusal = await listGridPage(
      DEF,
      execute,
      {
        ...BASE,
        filters: [{ field: "labels", op: "any_of", values: ["a"] }],
      },
      20,
      undefined,
      LIMITS,
    ).catch((error: unknown) => error);
    expect((refusal as QueryRejected).code).toBe("narrow_first");
  });
});

describe("the DDL of the new indexes", () => {
  test("a text index is a trigram GIN and an array index a plain GIN, after the sort indexes", () => {
    expect(listIndexDdl(DEF).map((index) => index.ddl)).toEqual([
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_files_created_at ON files USING btree (created_at, id);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_files_starred__created_at ON files USING btree (starred, created_at, id);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_files_folder_id__created_at ON files USING btree (folder_id, created_at, id);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_files_name_trgm ON files USING gin (name gin_trgm_ops);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_files_tags_overlap ON files USING gin (tags);",
    ]);
    expect(generateGridMigration(DEF)).toContain(
      "CREATE EXTENSION IF NOT EXISTS pg_trgm;",
    );
    expect(
      generateGridMigration({
        ...DEF,
        indexes: DEF.indexes.filter((index) => !("text" in index)),
      }),
    ).not.toContain("pg_trgm");
  });

  test("each is found in pg_indexes by its own shape", () => {
    const rows = [
      "CREATE INDEX a ON public.files USING btree (created_at, id)",
      "CREATE INDEX b ON public.files USING btree (starred, created_at, id)",
      "CREATE INDEX c ON public.files USING btree (folder_id, created_at, id)",
      "CREATE INDEX d ON public.files USING gin (name gin_trgm_ops)",
      "CREATE INDEX e ON public.files USING gin (tags)",
    ].map((indexdef, at) => ({ indexname: `i${at}`, indexdef }));
    expect(listMissingIndexes(DEF, rows)).toEqual([]);
    const wrong = [
      rows[0],
      rows[1],
      {
        indexname: "reversed",
        indexdef:
          "CREATE INDEX reversed ON public.files USING btree (created_at, folder_id, id)",
      },
      {
        indexname: "joined",
        indexdef:
          "CREATE INDEX joined ON public.files USING gin ((((name || ' '::text) || note)) gin_trgm_ops)",
      },
      {
        indexname: "other",
        indexdef: "CREATE INDEX other ON public.files USING gin (labels)",
      },
    ];
    expect(listMissingIndexes(DEF, wrong).map((index) => index.name)).toEqual([
      "auto_files_folder_id__created_at",
      "auto_files_name_trgm",
      "auto_files_tags_overlap",
    ]);
  });

  test("an existing partial index answers no declared index", () => {
    const rows = [
      "CREATE INDEX a ON public.files USING btree (created_at, id) WHERE (deleted_at IS NULL)",
      "CREATE INDEX b ON public.files USING btree (starred, created_at, id)",
      "CREATE INDEX c ON public.files USING btree (folder_id, created_at, id) WHERE ((note IS NULL) AND (deleted_at IS NULL))",
      "CREATE INDEX d ON public.files USING gin (name gin_trgm_ops)",
      "CREATE INDEX e ON public.files USING gin (tags) WHERE (tags IS NOT NULL)",
    ].map((indexdef, at) => ({ indexname: `i${at}`, indexdef }));
    expect(listMissingIndexes(DEF, rows).map((index) => index.name)).toEqual([
      "auto_files_created_at",
      "auto_files_folder_id__created_at",
      "auto_files_tags_overlap",
    ]);
  });
});

describe("a blank filter", () => {
  test("is answered by an index that filters its field, in sort order with no narrowed count", async () => {
    const def: PostgresGridDef = {
      ...DEF,
      indexes: [
        ...DEF.indexes,
        { filter: ["deleted_at"], sort: ["created_at"] },
      ],
    };
    for (const op of ["blank", "not_blank"] as const) {
      const { calls, execute } = recording(() => []);
      await listGridPage(
        def,
        execute,
        { ...BASE, filters: [{ field: "deleted_at", op }] },
        20,
        undefined,
        LIMITS,
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].sql.text).toContain(
        `WHERE t.deleted_at ${op === "blank" ? "IS NULL" : "IS NOT NULL"} ORDER BY t.created_at DESC, t.id DESC LIMIT 21`,
      );
    }
    expect(listIndexDdl(def).map((index) => index.ddl)).toContain(
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_files_deleted_at__created_at ON files USING btree (deleted_at, created_at, id);",
    );
  });

  test("on a field no index filters runs over the narrowed set, and is refused past its limit", async () => {
    const query = {
      ...BASE,
      filters: [
        { field: "folder_id", op: "any_of", values: [FOLDER] },
        { field: "deleted_at", op: "blank" },
      ] satisfies Filter[],
    };
    const { calls, execute } = recording(() => [{ count: 7 }]);
    await listGridPage(DEF, execute, query, 20, undefined, LIMITS);
    expect(calls).toHaveLength(2);
    expect(calls[0].sql.text).toContain(
      "WHERE t.folder_id = $1::uuid LIMIT 51) capped",
    );
    expect(calls[1].sql.text).toContain(
      "t.folder_id = $1::uuid AND t.deleted_at IS NULL",
    );
    const over = recording(() => [{ count: 51 }]);
    const refusal = await listGridPage(
      DEF,
      over.execute,
      query,
      20,
      undefined,
      LIMITS,
    ).catch((error: unknown) => error);
    expect((refusal as QueryRejected).code).toBe("narrow_first");
  });
});

describe("the def rules of the new indexes", () => {
  test("the test def is valid", () => {
    expect(validateGridDef(DEF)).toEqual([]);
  });

  test("a filtered index is not the index of the unfiltered grid", () => {
    expect(
      validateGridDef({
        ...DEF,
        indexes: [
          { filter: ["deleted_at"], sort: ["created_at"] },
          ...DEF.indexes.slice(1),
        ],
      }),
    ).toEqual(["the default sort with no filter is not a declared index"]);
  });

  test("an array is neither a filter nor a sort column, and its index needs an array", () => {
    expect(
      validateGridDef({
        ...DEF,
        indexes: [
          ...DEF.indexes,
          { filter: ["tags"], sort: ["created_at"] },
          { filter: [], sort: ["tags"] },
          { array: "name" },
          { array: "tags" },
          { array: "nope" },
        ],
      }),
    ).toEqual([
      'index tags|created_at: tags is an array; its index is { array: "tags" }',
      "index |tags: a nullable field cannot be a keyset sort",
      "index |tags: tags is an array, which has no order",
      "index array:name: name is not an array field",
      "index array:tags is declared twice",
      "index array:nope: unknown array field nope",
    ]);
  });

  test("a text index needs a text field without options", () => {
    expect(
      validateGridDef({
        ...DEF,
        indexes: [
          ...DEF.indexes,
          { text: "size" },
          { text: "starred" },
          { text: "nope" },
        ],
      }),
    ).toEqual([
      "index text:size: size is not a text field without options",
      "index text:starred: starred is not a text field without options",
      "index text:nope: unknown text field nope",
    ]);
  });
});
