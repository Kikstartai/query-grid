import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "pg";

import {
  CSV_BOM,
  defaultQuery,
  DEFAULT_LIMITS,
  encodeQuery,
  isQueryBudgeted,
  planQuery,
  type GridRow,
  type QueryState,
  type RangeState,
  type TextState,
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
    { equals: [], sort: "created_at", range: true },
    { equals: [], sort: "size", range: true },
    { equals: ["starred"], sort: "created_at", range: true },
    { equals: ["folder_id"], sort: "created_at", empty: ["deleted_at"] },
    { equals: [], sort: "size", then: ["created_at"] },
  ],
  textIndexes: ["name"],
  arrayIndexes: ["tags"],
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

function range(field: string, bounds: Partial<RangeState>): RangeState {
  return { field, min: null, max: null, ...bounds };
}

function text(field: string, op: TextState["op"], value: string): TextState {
  return { field, op, value };
}

describe("the schema of the new indexes", () => {
  test("the def is valid and every index it declares is found in pg_indexes", async () => {
    expect(validateGridDef(DEF)).toEqual([]);
    const { rows } = await client.query<PgIndexRow>(
      "SELECT p.indexname, p.indexdef, i.indisvalid AS valid FROM pg_indexes p JOIN pg_class c ON c.relname = p.indexname JOIN pg_index i ON i.indexrelid = c.oid WHERE p.schemaname = 'public' AND p.tablename = $1",
      [TABLE],
    );
    expect(listMissingIndexes(DEF, rows)).toEqual([]);
    expect(rows.map((row) => row.indexdef).join("\n")).toContain(
      "WHERE (deleted_at IS NULL)",
    );
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
  const cases: [string, Partial<QueryState>][] = [
    [
      "an open lower bound on the sort",
      {
        ranges: [
          range("created_at", {
            min: ROWS[700].created_at as string,
            minExclusive: true,
          }),
        ],
      },
    ],
    [
      "a closed lower bound on the sort",
      {
        ranges: [range("created_at", { min: ROWS[700].created_at as string })],
      },
    ],
    [
      "an open upper bound off the sort",
      {
        ranges: [range("size", { max: "250", maxExclusive: true })],
      },
    ],
    [
      "both bounds open on a decimal",
      {
        ranges: [
          range("rate", {
            min: "10",
            max: "20.5",
            minExclusive: true,
            maxExclusive: true,
          }),
        ],
      },
    ],
    [
      "not between, on a nullable decimal",
      {
        ranges: [range("rate", { min: "10", max: "20.5", exclude: true })],
      },
    ],
    [
      "not equal to one number",
      {
        ranges: [range("size", { min: "250", max: "250", exclude: true })],
      },
    ],
    [
      "not more than, written as an excluded open bound",
      {
        ranges: [
          range("size", { min: "250", exclude: true, minExclusive: true }),
        ],
      },
    ],
    [
      "on one day of a date field",
      {
        ranges: [range("due", { min: "2026-02-10", max: "2026-02-10" })],
      },
    ],
    [
      "not on one day of a nullable date field",
      {
        ranges: [
          range("due", { min: "2026-02-10", max: "2026-02-10", exclude: true }),
        ],
      },
    ],
    [
      "after a day of a date field",
      {
        ranges: [range("due", { min: "2026-03-01", minExclusive: true })],
      },
    ],
    [
      "two ranges on one field",
      {
        ranges: [
          range("size", { min: "100" }),
          range("size", { min: "200", max: "300", exclude: true }),
        ],
      },
    ],
    [
      "contains on the indexed text field",
      {
        texts: [text("name", "contains", "voice")],
      },
    ],
    ["starts with, any case", { texts: [text("name", "starts_with", "REP")] }],
    ["ends with, any case", { texts: [text("name", "ends_with", "MEMO")] }],
    [
      "ends with on a field with no index",
      {
        texts: [text("note", "ends_with", ".PDF")],
      },
    ],
    [
      "a wildcard in the value is plain text",
      {
        texts: [text("note", "contains", "50%")],
      },
    ],
    [
      "an underscore in the value is plain text",
      {
        texts: [text("note", "contains", "r_r")],
      },
    ],
    [
      "does not contain, on a nullable field",
      {
        texts: [text("note", "not_contains", "pdf")],
      },
    ],
    [
      "is not, matching the stored case",
      {
        texts: [text("note", "not_equals", "Final")],
      },
    ],
    [
      "two text filters on one field",
      {
        texts: [
          text("name", "contains", "invoice"),
          text("name", "not_contains", "draft"),
        ],
      },
    ],
    [
      "an overlap on the indexed array",
      { overlaps: { tags: ["red", "amber"] } },
    ],
    [
      "an overlap on an array with no index",
      { overlaps: { labels: ["blue"] } },
    ],
    ["a boolean", { equals: { starred: ["true"] } }],
    [
      "a boolean beside a range on the sort",
      {
        equals: { starred: ["false"] },
        ranges: [
          range("created_at", {
            max: ROWS[900].created_at as string,
            maxExclusive: true,
          }),
        ],
      },
    ],
    [
      "a partial index: one folder, not deleted",
      {
        equals: { folder_id: [FOLDERS[1]], deleted_at: ["_empty"] },
      },
    ],
    [
      "match any across the new filters",
      {
        combine: "or",
        texts: [text("note", "starts_with", "under")],
        overlaps: { tags: ["blue"] },
        ranges: [range("size", { max: "10", maxExclusive: true })],
      },
    ],
    [
      "everything at once",
      {
        equals: { starred: ["false"] },
        ranges: [
          range("rate", { min: "5", exclude: true }),
          range("due", { min: "2026-01-15" }),
        ],
        texts: [
          text("name", "contains", "re"),
          text("note", "not_equals", "n/a"),
        ],
        overlaps: { tags: ["green", "blue"] },
      },
    ],
  ];

  for (const [name, filters] of cases) {
    test(
      name,
      async () => {
        const ids = await expectSame(name, filters);
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
      texts: [text("note", "not_equals", "final")],
    });
    expect(ids).toHaveLength(ROW_COUNT);
  }, 60_000);

  test("an ascending sort on a number pages the same way", async () => {
    await expectSame("ascending size", {
      sort: { field: "size", direction: "asc" },
      ranges: [range("size", { min: "100", max: "400", minExclusive: true })],
    });
  }, 60_000);

  test("the total of a filtered set is the memory source's", async () => {
    const query = {
      ...BASE,
      texts: [text("name", "starts_with", "inv")],
      ranges: [range("size", { min: "50", max: "60", exclude: true })],
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
    for (const filters of [
      { texts: [text("name", "contains", "voice")] },
      { overlaps: { tags: ["red"] } },
      {
        equals: { starred: ["true"] },
        texts: [text("name", "ends_with", "memo")],
      },
    ]) {
      const query = { ...BASE, ...filters };
      expect(isQueryBudgeted(DEF, query)).toBe(true);
      calls.length = 0;
      await listGridPage(DEF, execute, query, 20);
      expect(calls).toHaveLength(1);
      expect(calls[0].settings).toEqual(listSearchSettings(DEFAULT_LIMITS));
    }
  });

  test("a negation, a field with no index and a second range are sized first", async () => {
    for (const filters of [
      { texts: [text("name", "not_contains", "voice")] },
      { texts: [text("note", "contains", "pdf")] },
      { overlaps: { labels: ["red"] } },
      { ranges: [range("size", { min: "1", max: "5", exclude: true })] },
    ]) {
      const query = { ...BASE, ...filters };
      expect(planQuery(DEF.indexes, query, DEF)).toMatchObject({
        narrowed: true,
        budgeted: false,
      });
      calls.length = 0;
      await listGridPage(DEF, execute, query, 20);
      expect(calls).toHaveLength(2);
      expect(calls[0].sql.text).toContain(") capped");
    }
  });

  test("a narrowed filter is refused over the limit and runs under it", async () => {
    const query = { ...BASE, texts: [text("note", "contains", "pdf")] };
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
      await explain({ overlaps: { tags: ["nothing-has-this"] } }),
    ).toContain(`auto_${TABLE}_tags_overlap`);
    expect(
      await explain({ texts: [text("name", "contains", "zzqqxx-no-match")] }),
    ).toContain(`auto_${TABLE}_name_trgm`);
    expect(
      await explain({
        equals: { folder_id: [RARE_FOLDER], deleted_at: ["_empty"] },
      }),
    ).toContain(`auto_${TABLE}_folder_id__created_at__empty_deleted_at`);
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
          equals: { starred: ["true"] },
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
      equals: { status_code: ["failed"], channel: ["phone"] },
      sort: { field: "created_at", direction: "desc" },
      thenBy: [{ field: "region", direction: "asc" }],
    };
    expect(planQuery(ORDERS_GRID_DEF.indexes, narrowed)?.narrowed).toBe(true);
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
      { equals: { starred: ["true"] } },
      { texts: [text("name", "contains", "invoice")] },
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
      equals: { status_code: ["failed"], channel: ["phone"] },
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
      texts: [{ field: "customer_name", op: "contains", value: "Mokoena" }],
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
      text("customer_name", "starts_with", "Zan"),
      text("customer_name", "ends_with", "ena"),
    ]) {
      const query: QueryState = { ...base, texts: [filter] };
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
        ranges: [
          { field: "created_at", min: null, max: edge, maxExclusive: true },
        ],
      },
      3,
    );
    const closed = await listGridPage(
      ORDERS_GRID_DEF,
      execute,
      { ...base, ranges: [{ field: "created_at", min: null, max: edge }] },
      3,
    );
    expect(String(closed.rows[0].created_at)).toBe(edge);
    expect(String(open.rows[0].created_at) < edge).toBe(true);
    expect(calls.at(-1)?.sql.text).toContain("t.created_at <= ");
    expect(calls.at(-2)?.sql.text).toContain("t.created_at < ");
  }, 60_000);
});
