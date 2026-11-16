import { describe, expect, test } from "bun:test";

import {
  decodeQuery,
  defaultQuery,
  DEFAULT_LIMITS,
  encodeQuery,
  type QueryState,
  type TextState,
} from "@kikstart/query-grid";

import { validateGridDef } from "./index-defs.ts";
import {
  getGridCount,
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
    { equals: [], sort: "created_at", range: true },
    { equals: ["starred"], sort: "created_at" },
    { equals: ["folder_id"], sort: "created_at", empty: ["deleted_at"] },
  ],
  textIndexes: ["name"],
  arrayIndexes: ["tags"],
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

function text(field: string, op: TextState["op"], value: string): TextState {
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
        ranges: [
          {
            field: "created_at",
            min: "2026-01-01T00:00:00Z",
            max: "2026-02-01T00:00:00Z",
            minExclusive: true,
            maxExclusive: true,
          },
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
        ranges: [{ field: "rate", min: "1.5", max: "2.5", exclude: true }],
      }),
    ).toEqual({
      text: "(t.rate < $1::numeric OR t.rate > $2::numeric OR t.rate IS NULL)",
      values: ["1.5", "2.5"],
    });
    expect(
      where({
        ranges: [
          {
            field: "size",
            min: "5",
            max: null,
            exclude: true,
            minExclusive: true,
          },
        ],
      }).text,
    ).toBe("t.size <= $1::bigint");
    expect(
      where({
        ranges: [
          { field: "due", min: "2026-03-01", max: "2026-03-01", exclude: true },
        ],
      }).text,
    ).toBe("(t.due < $1::date OR t.due > $2::date OR t.due IS NULL)");
  });

  test("two ranges on one field are two clauses", () => {
    expect(
      where({
        ranges: [
          { field: "size", min: "5", max: null },
          { field: "size", min: "9", max: "9", exclude: true },
        ],
      }).text,
    ).toBe(
      "t.size >= $1::bigint AND (t.size < $2::bigint OR t.size > $3::bigint)",
    );
  });
});

describe("the SQL of a text filter", () => {
  test("each operator is one comparison with the value's wildcards escaped", () => {
    expect(where({ texts: [text("note", "starts_with", "50%")] })).toEqual({
      text: "t.note ILIKE $1",
      values: ["50\\%%"],
    });
    expect(where({ texts: [text("note", "ends_with", "_v2")] }).values).toEqual(
      ["%\\_v2"],
    );
    expect(
      where({ texts: [text("note", "contains", " gift ")] }).values,
    ).toEqual(["%gift%"]);
  });

  test("a negation keeps an empty cell on a nullable field", () => {
    expect(where({ texts: [text("note", "not_contains", "gift")] })).toEqual({
      text: "(t.note NOT ILIKE $1 OR t.note IS NULL)",
      values: ["%gift%"],
    });
    expect(where({ texts: [text("name", "not_contains", "gift")] }).text).toBe(
      "t.name NOT ILIKE $1",
    );
    expect(where({ texts: [text("note", "not_equals", "50%")] })).toEqual({
      text: "t.note IS DISTINCT FROM $1",
      values: ["50%"],
    });
  });

  test("several on one field are ANDed, or ORed under match any", () => {
    const texts = [
      text("note", "contains", "gift"),
      text("note", "not_contains", "card"),
    ];
    expect(where({ texts }).text).toBe(
      "t.note ILIKE $1 AND (t.note NOT ILIKE $2 OR t.note IS NULL)",
    );
    expect(where({ texts, match: "any" }).text).toBe(
      "(t.note ILIKE $1 OR (t.note NOT ILIKE $2 OR t.note IS NULL))",
    );
  });
});

describe("the SQL of the new field types", () => {
  test("an overlap is one array parameter", () => {
    expect(where({ overlaps: { tags: ["red", "blue"] } })).toEqual({
      text: "t.tags && $1::text[]",
      values: [["red", "blue"]],
    });
  });

  test("a boolean is cast, and a partial index's field is IS NULL", () => {
    expect(where({ equals: { starred: ["true"] } })).toEqual({
      text: "t.starred = $1::boolean",
      values: ["true"],
    });
    expect(
      where({ equals: { folder_id: [FOLDER], deleted_at: ["_empty"] } }).text,
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
      equals: { starred: ["false"] },
      ranges: [
        { field: "size", min: "1", max: "9", exclude: true },
        { field: "due", min: "2026-01-01", max: null, minExclusive: true },
      ],
      texts: [text("note", "ends_with", ".pdf")],
      overlaps: { labels: ["a"] },
    };
    const decoded = decodeQuery(DEF, encodeQuery(DEF, query));
    expect(buildCappedCountSql(DEF, decoded)).toEqual(
      buildCappedCountSql(DEF, query),
    );
  });
});

describe("a filter with an index of its own", () => {
  const indexed = { ...BASE, texts: [text("name", "contains", "invoice")] };

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
          { ...BASE, overlaps: { tags: ["red"] } },
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
        { ...BASE, texts: [filter] },
        20,
        undefined,
        LIMITS,
      );
      expect(calls).toHaveLength(2);
      expect(calls[0].sql.text).toContain("LIMIT 51) capped");
      expect(calls[1].settings).toEqual(["enable_seqscan = off"]);
    }
  });

  test("an overlap with no index is refused over the narrowed-set limit", async () => {
    const { execute } = recording(() => [{ count: 51 }]);
    const refusal = await listGridPage(
      DEF,
      execute,
      { ...BASE, overlaps: { labels: ["a"] } },
      20,
      undefined,
      LIMITS,
    ).catch((error: unknown) => error);
    expect((refusal as QueryRejected).code).toBe("narrow_first");
  });
});

describe("the DDL of the new indexes", () => {
  test("a text index is a trigram GIN, an array index a plain GIN, a partial index has its WHERE", () => {
    expect(listIndexDdl(DEF).map((index) => index.ddl)).toEqual([
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_files_created_at ON files USING btree (created_at, id);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_files_starred__created_at ON files USING btree (starred, created_at, id);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_files_folder_id__created_at__empty_deleted_at ON files USING btree (folder_id, created_at, id) WHERE deleted_at IS NULL;",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_files_name_trgm ON files USING gin (name gin_trgm_ops);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_files_tags_overlap ON files USING gin (tags);",
    ]);
    expect(generateGridMigration(DEF)).toContain(
      "CREATE EXTENSION IF NOT EXISTS pg_trgm;",
    );
    expect(
      generateGridMigration({ ...DEF, textIndexes: undefined }),
    ).not.toContain("pg_trgm");
  });

  test("each is found in pg_indexes by its own shape", () => {
    const rows = [
      "CREATE INDEX a ON public.files USING btree (created_at, id)",
      "CREATE INDEX b ON public.files USING btree (starred, created_at, id)",
      "CREATE INDEX c ON public.files USING btree (folder_id, created_at, id) WHERE (deleted_at IS NULL)",
      "CREATE INDEX d ON public.files USING gin (name gin_trgm_ops)",
      "CREATE INDEX e ON public.files USING gin (tags)",
    ].map((indexdef, at) => ({ indexname: `i${at}`, indexdef }));
    expect(listMissingIndexes(DEF, rows)).toEqual([]);
    const wrong = [
      rows[0],
      rows[1],
      {
        indexname: "whole",
        indexdef:
          "CREATE INDEX whole ON public.files USING btree (folder_id, created_at, id)",
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
      "auto_files_folder_id__created_at__empty_deleted_at",
      "auto_files_name_trgm",
      "auto_files_tags_overlap",
    ]);
  });

  test("a partial index over two fields matches in either order", () => {
    const def: PostgresGridDef = {
      ...DEF,
      indexes: [
        DEF.indexes[0],
        { equals: [], sort: "created_at", empty: ["note", "deleted_at"] },
      ],
    };
    const rows = [
      "CREATE INDEX a ON public.files USING btree (created_at, id)",
      "CREATE INDEX b ON public.files USING btree (created_at, id) WHERE ((note IS NULL) AND (deleted_at IS NULL))",
      "CREATE INDEX d ON public.files USING gin (name gin_trgm_ops)",
      "CREATE INDEX e ON public.files USING gin (tags)",
    ].map((indexdef, at) => ({ indexname: `i${at}`, indexdef }));
    expect(listMissingIndexes(def, rows)).toEqual([]);
  });
});

describe("the def rules of the new indexes", () => {
  test("the test def is valid", () => {
    expect(validateGridDef(DEF)).toEqual([]);
  });

  test("an array is neither an equality nor a sort, and its index needs an array", () => {
    expect(
      validateGridDef({
        ...DEF,
        indexes: [...DEF.indexes, { equals: ["tags"], sort: "created_at" }],
        arrayIndexes: ["name", "tags", "tags", "nope"],
      }),
    ).toEqual([
      "index tags|created_at: tags is an array; its index is declared in arrayIndexes",
      "arrayIndexes: name is not an array field",
      "arrayIndexes: unknown field nope",
      "arrayIndexes: tags is declared twice",
    ]);
  });

  test("a text index needs a text field, and a partial index a nullable one", () => {
    expect(
      validateGridDef({
        ...DEF,
        textIndexes: ["size"],
        indexes: [
          ...DEF.indexes,
          { equals: ["starred"], sort: "created_at", empty: ["name", "nope"] },
          {
            equals: ["folder_id"],
            sort: "created_at",
            empty: ["folder_id"],
          },
        ],
      }),
    ).toEqual([
      "index starred|created_at|empty:name+nope: name is never empty",
      "index starred|created_at|empty:name+nope: unknown empty field nope",
      "index folder_id|created_at|empty:folder_id: folder_id is empty in every row of the index, so it cannot also be an equality or the sort",
      "textIndexes: size is not a text field without options",
    ]);
  });
});
