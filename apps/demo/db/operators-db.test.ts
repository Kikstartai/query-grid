import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "pg";

import {
  CSV_BOM,
  defaultQuery,
  DEFAULT_LIMITS,
  encodeQuery,
  isQueryBudgeted,
  planQuery,
  type Combinator,
  type Filter,
  type GridRow,
  type QueryState,
  type ValueFilter,
} from "@kikstart/query-grid";
import { createMemorySource } from "@kikstart/query-grid/memory";
import {
  buildPageSql,
  createGridHandler,
  getGridCount,
  listGridMigrationSteps,
  listGridPage,
  listGridTotals,
  listMissingIndexes,
  listSearchSettings,
  QueryRejected,
  validateGridDef,
  type PgIndexRow,
  type PostgresGridDef,
  type SqlExecutor,
  type SqlQuery,
} from "@kikstart/query-grid-postgres";

import { ORDERS_GRID_DEF } from "../src/core/orders/orders-grid-def";
import { createPgExecutor, type PgExecutor } from "../src/lib/pg-executor";

const TABLE = "qg_operator_files";
const ROW_COUNT = 1500;
const FOLDERS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];
const WORDS = ["Invoice", "receipt", "Report", "draft", "Contract", "memo"];
const NOTES = ["paid.pdf", "50% off", "under_review", "Final", "n/a"];
const RARE_FOLDER = "44444444-4444-4444-8444-444444444444";
const TAGS = ["red", "green", "blue", "amber"];

const DEF: PostgresGridDef = {
  id: "operator-files",
  table: TABLE,
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
    { filter: [], sort: ["size"] },
    { filter: ["starred"], sort: ["created_at"] },
    { filter: ["folder_id", "deleted_at"], sort: ["created_at"] },
    { filter: [], sort: ["size", "created_at"] },
    { text: "name" },
    { array: "tags" },
  ],
};

function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function pick<T>(random: () => number, items: T[]): T {
  return items[Math.floor(random() * items.length)];
}

function maybe<T>(
  random: () => number,
  odds: number,
  value: () => T,
): T | null {
  return random() < odds ? value() : null;
}

function toStamp(at: number): string {
  return new Date(at).toISOString().replace("Z", "000Z");
}

function listRows(): GridRow[] {
  const random = createRandom(20261116);
  const start = Date.UTC(2026, 0, 1);
  return Array.from({ length: ROW_COUNT }, (_, index) => {
    const created =
      start + index * 3_600_000 + Math.floor(random() * 3_000_000);
    return {
      id: `00000000-0000-7000-8000-${String(index + 1).padStart(12, "0")}`,
      name: `${pick(random, WORDS)} ${index % 97} ${pick(random, WORDS)}`,
      note: maybe(random, 0.7, () => pick(random, NOTES)),
      size: Math.floor(random() * 500),
      rate: maybe(random, 0.8, () => Math.floor(random() * 4000) / 100),
      starred: random() < 0.3,
      due: maybe(random, 0.75, () =>
        new Date(start + Math.floor(random() * 120) * 86_400_000)
          .toISOString()
          .slice(0, 10),
      ),
      created_at: toStamp(created),
      deleted_at: maybe(random, 0.2, () => toStamp(created + 86_400_000)),
      folder_id: maybe(random, 0.85, () =>
        random() < 0.02 ? RARE_FOLDER : pick(random, FOLDERS),
      ),
      tags: maybe(random, 0.8, () => TAGS.filter(() => random() < 0.35)),
      labels: maybe(random, 0.5, () => TAGS.filter(() => random() < 0.5)),
    };
  });
}

const ROWS = listRows();
const BASE = defaultQuery(DEF);
const memory = createMemorySource(DEF, ROWS);
const signal = new AbortController().signal;

const client = new Client({
  connectionString: process.env.QUERY_GRID_DATABASE_URL,
});
let executor: PgExecutor;

interface Call {
  sql: SqlQuery;
  settings: string[] | undefined;
}

const calls: Call[] = [];
const execute: SqlExecutor = (sql, settings, abort) => {
  calls.push({ sql, settings });
  return executor.execute(sql, settings, abort);
};

async function createTable(): Promise<void> {
  await client.query(`DROP TABLE IF EXISTS ${TABLE}`);
  await client.query(`CREATE TABLE ${TABLE} (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    note text,
    size bigint NOT NULL,
    rate numeric(10, 2),
    starred boolean NOT NULL,
    due date,
    created_at timestamptz NOT NULL,
    deleted_at timestamptz,
    folder_id uuid,
    tags text[],
    labels text[]
  )`);
  await client.query(
    `INSERT INTO ${TABLE} SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(
      id uuid, name text, note text, size bigint, rate numeric(10, 2), starred boolean,
      due date, created_at timestamptz, deleted_at timestamptz, folder_id uuid,
      tags text[], labels text[])`,
    [JSON.stringify(ROWS)],
  );
  for (const step of listGridMigrationSteps(DEF, { concurrently: false })) {
    await client.query(step.sql);
  }
  await client.query(`ANALYZE ${TABLE}`);
}

beforeAll(async () => {
  executor = createPgExecutor(process.env.QUERY_GRID_DATABASE_URL ?? "");
  await client.connect();
  await createTable();
}, 120_000);

afterAll(async () => {
  await client.query(`DROP TABLE IF EXISTS ${TABLE}`);
  await client.end();
  await executor.end();
});

async function walk(
  page: (query: QueryState) => Promise<{ ids: string[]; next: string | null }>,
  query: QueryState,
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const result = await page({ ...query, cursor });
    ids.push(...result.ids);
    cursor = result.next;
  } while (cursor !== null);
  return ids;
}

function listFromPostgres(query: QueryState): Promise<string[]> {
  return walk(async (paged) => {
    const page = await listGridPage(DEF, execute, paged, 400);
    return { ids: page.rows.map((row) => row.id), next: page.nextCursor };
  }, query);
}

function listFromMemory(query: QueryState): Promise<string[]> {
  return walk(async (paged) => {
    const page = await memory.fetchPage(paged, 400, signal);
    return { ids: page.rows.map((row) => row.id), next: page.nextCursor };
  }, query);
}

async function expectSame(
  name: string,
  filters: Partial<QueryState>,
): Promise<string[]> {
  const query = { ...BASE, ...filters };
  const [fromPostgres, fromMemory] = await Promise.all([
    listFromPostgres(query),
    listFromMemory(query),
  ]);
  expect({ name, ids: fromPostgres }).toEqual({ name, ids: fromMemory });
  const count = await getGridCount(DEF, execute, query, true);
  expect({ name, count: count.count }).toEqual({
    name,
    count: fromMemory.length,
  });
  return fromMemory;
}

function one(field: string, op: ValueFilter["op"], value: string): ValueFilter {
  return { field, op, value };
}

function anyOf(field: string, ...values: (string | null)[]): Filter {
  return { field, op: "any_of", values };
}

function stampOf(at: number): string {
  return ROWS[at].created_at as string;
}

describe("the schema of the new indexes", () => {
  test("the def is valid and every index it declares is found in pg_indexes", async () => {
    expect(validateGridDef(DEF)).toEqual([]);
    const { rows } = await client.query<PgIndexRow>(
      "SELECT p.indexname, p.indexdef, i.indisvalid AS valid FROM pg_indexes p JOIN pg_class c ON c.relname = p.indexname JOIN pg_index i ON i.indexrelid = c.oid WHERE p.schemaname = 'public' AND p.tablename = $1",
      [TABLE],
    );
    expect(listMissingIndexes(DEF, rows)).toEqual([]);
    expect(rows.map((row) => row.indexdef).join("\n")).not.toContain("WHERE");
  });

  test("a new type comes back in the row as the memory source holds it", async () => {
    const page = await listGridPage(
      DEF,
      execute,
      { ...BASE, sort: { field: "created_at", direction: "asc" } },
      50,
    );
    expect(page.rows).toEqual(
      [...ROWS]
        .sort((a, b) =>
          String(a.created_at).localeCompare(String(b.created_at)),
        )
        .slice(0, 50),
    );
  });
});

describe("every operator answers as the memory source does", () => {
  const cases: [string, Filter[], Combinator?][] = [
    [
      "an open lower bound on the sort",
      [one("created_at", "greater_than", stampOf(700))],
    ],
    [
      "a closed lower bound on the sort",
      [one("created_at", "greater_or_equal", stampOf(700))],
    ],
    ["an open upper bound off the sort", [one("size", "less_than", "250")]],
    [
      "both bounds open on a decimal",
      [one("rate", "greater_than", "10"), one("rate", "less_than", "20.5")],
    ],
    [
      "not between, on a nullable decimal",
      [{ field: "rate", op: "not_between", min: "10", max: "20.5" }],
    ],
    ["not equal to one number", [one("size", "not_equals", "250")]],
    [
      "at most, the complement of more than",
      [one("size", "less_or_equal", "250")],
    ],
    ["on one day of a date field", [one("due", "equals", "2026-02-10")]],
    [
      "not on one day of a nullable date field",
      [one("due", "not_equals", "2026-02-10")],
    ],
    ["after a day of a date field", [one("due", "greater_than", "2026-03-01")]],
    [
      "on one day of a datetime field",
      [one("created_at", "equals", stampOf(700).slice(0, 10))],
    ],
    [
      "two filters on one field",
      [
        one("size", "greater_or_equal", "100"),
        { field: "size", op: "not_between", min: "200", max: "300" },
      ],
    ],
    ["contains on the indexed text field", [one("name", "contains", "voice")]],
    ["starts with, any case", [one("name", "starts_with", "REP")]],
    ["ends with, any case", [one("name", "ends_with", "MEMO")]],
    ["ends with on a field with no index", [one("note", "ends_with", ".PDF")]],
    ["a wildcard in the value is plain text", [one("note", "contains", "50%")]],
    [
      "an underscore in the value is plain text",
      [one("note", "contains", "r_r")],
    ],
    [
      "does not contain, on a nullable field",
      [one("note", "not_contains", "pdf")],
    ],
    ["is not, matching the stored case", [one("note", "not_equals", "Final")]],
    [
      "equals on a text field, the stored case",
      [one("note", "equals", "Final")],
    ],
    [
      "equals on the indexed text field",
      [one("name", "equals", ROWS[3].name as string)],
    ],
    [
      "two text filters on one field",
      [
        one("name", "contains", "invoice"),
        one("name", "not_contains", "draft"),
      ],
    ],
    ["blank on a nullable text field", [{ field: "note", op: "blank" }]],
    ["not blank on a nullable number", [{ field: "rate", op: "not_blank" }]],
    ["blank on a nullable date", [{ field: "due", op: "blank" }]],
    ["an overlap on the indexed array", [anyOf("tags", "red", "amber")]],
    ["an overlap on an array with no index", [anyOf("labels", "blue")]],
    [
      "all of on the indexed array",
      [{ field: "tags", op: "all_of", values: ["red", "blue"] }],
    ],
    [
      "all of on an array with no index",
      [{ field: "labels", op: "all_of", values: ["red", "green"] }],
    ],
    [
      "none of on an array",
      [{ field: "tags", op: "none_of", values: ["red"] }],
    ],
    ["blank on an array, null or empty", [{ field: "tags", op: "blank" }]],
    ["a boolean", [anyOf("starred", "true")]],
    [
      "a boolean beside a range on the sort",
      [anyOf("starred", "false"), one("created_at", "less_than", stampOf(900))],
    ],
    [
      "a filter index on the blank field: one folder or none, not deleted",
      [
        anyOf("folder_id", FOLDERS[0], null),
        { field: "deleted_at", op: "blank" },
      ],
    ],
    [
      "none of on an id with no fixed values",
      [{ field: "folder_id", op: "none_of", values: [FOLDERS[0], FOLDERS[1]] }],
    ],
    [
      "a filter index on the blank field: one folder, not deleted",
      [anyOf("folder_id", FOLDERS[1]), { field: "deleted_at", op: "blank" }],
    ],
    [
      "match any across the new filters",
      [
        one("note", "starts_with", "under"),
        anyOf("tags", "blue"),
        one("size", "less_than", "10"),
      ],
      "or",
    ],
    [
      "everything at once",
      [
        anyOf("starred", "false"),
        one("rate", "less_than", "5"),
        one("due", "greater_or_equal", "2026-01-15"),
        one("name", "contains", "re"),
        one("note", "not_equals", "n/a"),
        anyOf("tags", "green", "blue"),
      ],
    ],
  ];

  for (const [name, filters, combine = "and"] of cases) {
    test(
      name,
      async () => {
        const ids = await expectSame(name, { filters, combine });
        expect({ name, some: ids.length > 0 }).toEqual({ name, some: true });
        expect({ name, all: ids.length < ROW_COUNT }).toEqual({
          name,
          all: true,
        });
      },
      60_000,
    );
  }

  test("is not compares the exact case, so another case leaves every row in", async () => {
    const ids = await expectSame("is not, another case", {
      filters: [one("note", "not_equals", "final")],
    });
    expect(ids).toHaveLength(ROW_COUNT);
  }, 60_000);

  test("an ascending sort on a number pages the same way", async () => {
    await expectSame("ascending size", {
      sort: { field: "size", direction: "asc" },
      filters: [
        one("size", "greater_than", "100"),
        one("size", "less_or_equal", "400"),
      ],
    });
  }, 60_000);

  test("the total of a filtered set is the memory source's", async () => {
    const query: QueryState = {
      ...BASE,
      filters: [
        one("name", "starts_with", "inv"),
        { field: "size", op: "not_between", min: "50", max: "60" },
      ],
    };
    const [fromPostgres, fromMemory] = await Promise.all([
      listGridTotals(DEF, execute, query),
      memory.fetchTotals(query, signal),
    ]);
    expect(fromPostgres).toMatchObject([{ field: "size", available: true }]);
    expect(fromPostgres[0]).toMatchObject({
      sum: (fromMemory[0] as { sum: number }).sum,
      rows: (fromMemory[0] as { rows: number }).rows,
    });
  });
});

describe("the tier each filter runs in", () => {
  test("an indexed text filter and an indexed overlap run under the budget, with no size probe", async () => {
    const cases: Filter[][] = [
      [one("name", "contains", "voice")],
      [anyOf("tags", "red")],
      [{ field: "tags", op: "all_of", values: ["red", "blue"] }],
      [anyOf("starred", "true"), one("name", "ends_with", "memo")],
    ];
    for (const filters of cases) {
      const query = { ...BASE, filters };
      expect(isQueryBudgeted(DEF, query)).toBe(true);
      calls.length = 0;
      await listGridPage(DEF, execute, query, 20);
      expect(calls).toHaveLength(1);
      expect(calls[0].settings).toEqual(listSearchSettings(DEFAULT_LIMITS));
    }
  });

  test("a negation, a field with no index and a second range are sized first", async () => {
    const cases: Filter[][] = [
      [one("name", "not_contains", "voice")],
      [one("note", "contains", "pdf")],
      [anyOf("labels", "red")],
      [{ field: "size", op: "not_between", min: "1", max: "5" }],
      [{ field: "note", op: "blank" }],
      [{ field: "labels", op: "all_of", values: ["red"] }],
      [{ field: "folder_id", op: "none_of", values: [FOLDERS[0]] }],
      [one("name", "equals", "Invoice 3 memo")],
    ];
    for (const filters of cases) {
      const query = { ...BASE, filters };
      expect(planQuery(DEF, query)).toMatchObject({
        narrowed: true,
        budgeted: false,
      });
      calls.length = 0;
      await listGridPage(DEF, execute, query, 20);
      expect(calls).toHaveLength(2);
      expect(calls[0].sql.text).toContain(") capped");
    }
  }, 60_000);

  test("a narrowed filter is refused over the limit and runs under it", async () => {
    const query = { ...BASE, filters: [one("note", "contains", "pdf")] };
    const refusal = await listGridPage(DEF, execute, query, 20, undefined, {
      ...DEFAULT_LIMITS,
      narrowLimit: 100,
    }).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(QueryRejected);
    expect(refusal).toMatchObject({ code: "narrow_first" });
  });

  test("the trigram and array indexes are the ones the planner reads", async () => {
    const explain = async (filters: Partial<QueryState>) => {
      const sql = buildPageSql(DEF, { ...BASE, ...filters }, 20);
      await client.query("BEGIN; SET LOCAL enable_seqscan = off");
      const { rows } = await client.query<{ "QUERY PLAN": string }>(
        `EXPLAIN ${sql.text}`,
        sql.values,
      );
      await client.query("ROLLBACK");
      return rows.map((row) => row["QUERY PLAN"]).join("\n");
    };
    expect(
      await explain({ filters: [anyOf("tags", "nothing-has-this")] }),
    ).toContain(`auto_${TABLE}_tags_overlap`);
    expect(
      await explain({
        filters: [one("name", "contains", "zzqqxx-no-match")],
      }),
    ).toContain(`auto_${TABLE}_name_trgm`);
    expect(
      await explain({
        filters: [
          anyOf("folder_id", RARE_FOLDER),
          { field: "deleted_at", op: "blank" },
        ],
      }),
    ).toContain(`auto_${TABLE}_folder_id__deleted_at__created_at`);
  });
});

describe("several sort columns answer as the memory source does", () => {
  const by = (field: string, direction: "asc" | "desc") => ({
    field,
    direction,
  });

  test("a declared composite order pages by its whole key, both ways, with no size probe", async () => {
    for (const direction of ["asc", "desc"] as const) {
      calls.length = 0;
      const ids = await expectSame(`size then created, ${direction}`, {
        sort: by("size", direction),
        thenBy: [by("created_at", direction)],
      });
      expect(ids).toHaveLength(ROW_COUNT);
      expect(calls.some((call) => call.sql.text.includes(") capped"))).toBe(
        false,
      );
    }
  }, 60_000);

  test("further columns with no index run over the narrowed set, each its own way", async () => {
    const cases: [string, Partial<QueryState>][] = [
      [
        "created desc, size asc",
        { sort: by("created_at", "desc"), thenBy: [by("size", "asc")] },
      ],
      [
        "size asc, starred desc, created asc",
        {
          sort: by("size", "asc"),
          thenBy: [by("starred", "desc"), by("created_at", "asc")],
        },
      ],
      [
        "starred filter, size desc, created asc",
        {
          filters: [anyOf("starred", "true")],
          sort: by("created_at", "asc"),
          thenBy: [by("size", "desc")],
        },
      ],
      [
        "size desc, created asc: mixed, so not the composite index",
        { sort: by("size", "desc"), thenBy: [by("created_at", "asc")] },
      ],
    ];
    for (const [name, filters] of cases) {
      calls.length = 0;
      const ids = await expectSame(name, filters);
      expect(ids.length).toBeGreaterThan(400);
      expect(calls[0].sql.text).toContain(") capped");
    }
  }, 120_000);

  test("the composite index is the one the planner reads", async () => {
    const sql = buildPageSql(
      DEF,
      {
        ...BASE,
        sort: by("size", "asc"),
        thenBy: [by("created_at", "asc")],
      },
      20,
    );
    await client.query("BEGIN; SET LOCAL enable_seqscan = off");
    const { rows } = await client.query<{ "QUERY PLAN": string }>(
      `EXPLAIN ${sql.text}`,
      sql.values,
    );
    await client.query("ROLLBACK");
    const plan = rows.map((row) => row["QUERY PLAN"]).join("\n");
    expect(plan).toContain(`auto_${TABLE}_size__created_at`);
    expect(plan).not.toContain("Sort");
  }, 60_000);
});

describe("a composite order on the orders table", () => {
  const base = defaultQuery(ORDERS_GRID_DEF);
  const composite: QueryState = {
    ...base,
    sort: { field: "item_count", direction: "desc" },
    thenBy: [{ field: "total", direction: "desc" }],
  };

  test("pages in order by keyset at any table size, with one statement a page", async () => {
    calls.length = 0;
    const first = await listGridPage(ORDERS_GRID_DEF, execute, composite, 200);
    const second = await listGridPage(
      ORDERS_GRID_DEF,
      execute,
      { ...composite, cursor: first.nextCursor },
      200,
    );
    expect(calls).toHaveLength(2);
    const rows = [...first.rows, ...second.rows];
    expect(new Set(rows.map((row) => row.id)).size).toBe(400);
    const keys = rows.map((row) => [Number(row.item_count), Number(row.total)]);
    for (let at = 1; at < keys.length; at++) {
      const [items, total] = keys[at];
      const [lastItems, lastTotal] = keys[at - 1];
      expect(
        items < lastItems || (items === lastItems && total <= lastTotal),
      ).toBe(true);
    }
  }, 60_000);

  test("the planner walks the composite index and sorts nothing", async () => {
    const page = await listGridPage(ORDERS_GRID_DEF, execute, composite, 200);
    const sql = buildPageSql(
      ORDERS_GRID_DEF,
      { ...composite, cursor: page.nextCursor },
      200,
    );
    const { rows } = await client.query<{ "QUERY PLAN": string }>(
      `EXPLAIN ${sql.text}`,
      sql.values,
    );
    const plan = rows.map((row) => row["QUERY PLAN"]).join("\n");
    expect(plan).toContain("auto_orders_item_count__total");
    expect(plan).not.toContain("Sort");
    expect(plan).not.toContain("Seq Scan");
  }, 60_000);

  test("a further column with no index is refused on the whole table and runs once narrowed", async () => {
    const thenBy = [{ field: "total", direction: "asc" as const }];
    const refusal = await listGridPage(
      ORDERS_GRID_DEF,
      execute,
      { ...base, thenBy },
      50,
    ).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(QueryRejected);
    expect(refusal).toMatchObject({ code: "narrow_first" });
    const narrowed: QueryState = {
      ...base,
      filters: [anyOf("status_code", "failed"), anyOf("channel", "phone")],
      sort: { field: "created_at", direction: "desc" },
      thenBy: [{ field: "region", direction: "asc" }],
    };
    expect(planQuery(ORDERS_GRID_DEF, narrowed)?.narrowed).toBe(true);
    const page = await listGridPage(ORDERS_GRID_DEF, execute, narrowed, 50);
    expect(page.rows.length).toBeGreaterThan(0);
    const stamps = page.rows.map((row) => String(row.created_at));
    expect(stamps).toEqual([...stamps].sort().reverse());
  }, 60_000);
});

describe("an export is the memory source's file", () => {
  const read = async (def: PostgresGridDef, query: QueryState, path = "") => {
    const handler = createGridHandler({
      def,
      execute,
      onError: () => undefined,
    });
    const params = encodeQuery(def, query);
    return handler(new Request(`http://grid.test/export?${params}${path}`));
  };

  test("the same rows, order and cells, for a filter, a text filter and several sort columns", async () => {
    const cases: Partial<QueryState>[] = [
      {},
      { filters: [anyOf("starred", "true")] },
      { filters: [one("name", "contains", "invoice")] },
      {
        sort: { field: "size", direction: "desc" },
        thenBy: [{ field: "created_at", direction: "asc" }],
      },
    ];
    for (const filters of cases) {
      const query = { ...BASE, ...filters };
      const response = await read(DEF, query);
      expect(response.status).toBe(200);
      const text = new TextDecoder().decode(await response.arrayBuffer());
      const expected = await memory.fetchExport(query, {}, signal);
      expect(`${CSV_BOM}${text}`).toBe(expected);
    }
  }, 120_000);

  test("on 620,000 orders the whole table is refused from the counter and a small set is sent whole", async () => {
    const base = defaultQuery(ORDERS_GRID_DEF);
    calls.length = 0;
    const refused = await read(ORDERS_GRID_DEF, base);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({
      code: "export_too_large",
      params: { limit: DEFAULT_LIMITS.exportLimit },
    });
    expect(calls).toHaveLength(1);
    const small: QueryState = {
      ...base,
      filters: [anyOf("status_code", "failed"), anyOf("channel", "phone")],
    };
    const count = await getGridCount(ORDERS_GRID_DEF, execute, small, true);
    const sent = await read(
      ORDERS_GRID_DEF,
      small,
      "&columns=order_number,total",
    );
    const lines = (await sent.text()).trimEnd().split("\r\n");
    expect(lines[0]).toBe('"Order","Total"');
    expect(lines).toHaveLength(count.count + 1);
    expect(new Set(lines.slice(1).map((line) => line.split(",")[0])).size).toBe(
      count.count,
    );
  }, 120_000);
});

describe("the text index on the orders table", () => {
  const base = defaultQuery(ORDERS_GRID_DEF);

  test("a customer name contains filter is paged in order at any table size", async () => {
    const query: QueryState = {
      ...base,
      filters: [one("customer_name", "contains", "Mokoena")],
    };
    expect(isQueryBudgeted(ORDERS_GRID_DEF, query)).toBe(true);
    calls.length = 0;
    const first = await listGridPage(ORDERS_GRID_DEF, execute, query, 50);
    expect(calls).toHaveLength(1);
    expect(first.rows).toHaveLength(50);
    for (const row of first.rows) {
      expect(String(row.customer_name).toLowerCase()).toContain("mokoena");
    }
    const stamps = first.rows.map((row) => String(row.created_at));
    expect(stamps).toEqual([...stamps].sort().reverse());
    const second = await listGridPage(
      ORDERS_GRID_DEF,
      execute,
      { ...query, cursor: first.nextCursor },
      50,
    );
    expect(second.rows[0].id).not.toBe(first.rows[49].id);
    expect(String(second.rows[0].created_at) <= stamps[49]).toBe(true);
  }, 60_000);

  test("a starts-with and an ends-with read the same index", async () => {
    for (const filter of [
      one("customer_name", "starts_with", "Zan"),
      one("customer_name", "ends_with", "ena"),
    ]) {
      const query: QueryState = { ...base, filters: [filter] };
      const page = await listGridPage(ORDERS_GRID_DEF, execute, query, 20);
      expect(page.rows.length).toBeGreaterThan(0);
      for (const row of page.rows) {
        const name = String(row.customer_name).toLowerCase();
        expect(
          filter.op === "starts_with"
            ? name.startsWith("zan")
            : name.endsWith("ena"),
        ).toBe(true);
      }
    }
  }, 60_000);

  test("an open bound on the sort leaves the bound's own row out", async () => {
    const first = await listGridPage(ORDERS_GRID_DEF, execute, base, 3);
    const edge = String(first.rows[1].created_at);
    const open = await listGridPage(
      ORDERS_GRID_DEF,
      execute,
      {
        ...base,
        filters: [one("created_at", "less_than", edge)],
      },
      3,
    );
    const closed = await listGridPage(
      ORDERS_GRID_DEF,
      execute,
      { ...base, filters: [one("created_at", "less_or_equal", edge)] },
      3,
    );
    expect(String(closed.rows[0].created_at)).toBe(edge);
    expect(String(open.rows[0].created_at) < edge).toBe(true);
    expect(calls.at(-1)?.sql.text).toContain("t.created_at <= ");
    expect(calls.at(-2)?.sql.text).toContain("t.created_at < ");
  }, 60_000);
});
