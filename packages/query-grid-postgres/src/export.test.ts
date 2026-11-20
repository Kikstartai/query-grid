import { describe, expect, test } from "bun:test";

import {
  CSV_BOM,
  DEFAULT_LIMITS,
  defaultQuery,
  type GridRow,
} from "@kikstart/query-grid";
import { createHttpSource, type ErrorBody } from "@kikstart/query-grid/http";

import { TEST_DEF } from "./grid-def.fixture.ts";
import { createGridHandler } from "./grid-handler.ts";
import { walkExportPages, type SqlExecutor } from "./query-runner.ts";
import { QueryRejected, type SqlQuery } from "./sql-builder.ts";

const ORIGIN = "http://grid.test";
const BASE_PATH = "/api/things";
const BASE = defaultQuery(TEST_DEF);

function id(at: number): string {
  return `018f4b5e-0000-7000-8000-${String(at).padStart(12, "0")}`;
}

function row(at: number): GridRow {
  return {
    id: id(at),
    number: at,
    created_at: new Date(Date.UTC(2026, 0, 1) + at * 60_000)
      .toISOString()
      .replace("Z", "000Z"),
    total: at * 100,
    status: "open",
    region: "north",
    name: at === 2 ? "=1+1" : `Name, ${at}`,
    note: null,
  };
}

interface Fake {
  execute: SqlExecutor;
  seen: SqlQuery[];
}

function createFake(count: number, pageSize = 1000): Fake {
  const all = Array.from({ length: count }, (_, at) => row(count - at));
  const seen: SqlQuery[] = [];
  const execute: SqlExecutor = async <T extends object>(sql: SqlQuery) => {
    seen.push(sql);
    if (sql.text.includes("thing_status_counts")) {
      return [{ value: "open", count }] as T[];
    }
    if (sql.text.includes(") capped")) {
      return [{ count }] as T[];
    }
    const after = sql.values.at(-1);
    const cursor = sql.text.includes("(t.created_at, t.id) <");
    const start = cursor ? all.findIndex((item) => item.id === after) + 1 : 0;
    return all.slice(start, start + pageSize + 1) as unknown as T[];
  };
  return { execute, seen };
}

function createHandler(fake: Fake, exportLimit = DEFAULT_LIMITS.exportLimit) {
  const handler = createGridHandler({
    def: TEST_DEF,
    execute: fake.execute,
    basePath: BASE_PATH,
    limits: { exportLimit },
    onError: () => undefined,
  });
  return (path: string) => handler(new Request(`${ORIGIN}${BASE_PATH}${path}`));
}

describe("GET /export", () => {
  test("streams the whole result as CSV, a header first, in the columns asked for", async () => {
    const handle = createHandler(createFake(3));
    const response = await handle("/export?columns=number,name,total");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="things.csv"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe(
      `"Number","Name","Total"\r\n3,"Name, 3",3.00\r\n2,"'=1+1",2.00\r\n1,"Name, 1",1.00\r\n`,
    );
  });

  test("with no columns named it sends every field that is not hidden", async () => {
    const handle = createHandler(createFake(1));
    const text = await (await handle("/export")).text();
    expect(text.split("\r\n")[0]).toBe(
      '"ID","Number","Created","Total","Status","Region","Name","Note"',
    );
    expect(text).toContain(',"Open","North",');
  });

  test("an unknown column is refused before anything runs", async () => {
    const fake = createFake(1);
    const response = await createHandler(fake)("/export?columns=number,nope");
    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorBody).params).toEqual({
      field: "nope",
    });
    expect(fake.seen).toEqual([]);
  });

  test("over the export limit it is refused with the limit, before any page is read", async () => {
    const fake = createFake(8);
    const response = await createHandler(
      fake,
      5,
    )("/export?f.region.any_of=north");
    expect(response.status).toBe(400);
    expect((await response.json()) as ErrorBody).toMatchObject({
      error: "export_too_large",
      code: "export_too_large",
      params: { limit: 5 },
    });
    expect(fake.seen).toHaveLength(1);
    expect(fake.seen[0].text).toContain("LIMIT 6) capped");
  });

  test("a query the counter table counts is refused from the counter alone", async () => {
    const fake = createFake(8);
    const response = await createHandler(fake, 5)("/export");
    expect(response.status).toBe(400);
    expect(fake.seen).toHaveLength(1);
    expect(fake.seen[0].text).toContain("thing_status_counts");
  });

  test("a query no index answers is refused like any read", async () => {
    const response = await createHandler(createFake(1))(
      "/export?f.region.any_of=north&sort=total.desc",
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorBody).code).toBe("unindexed_query");
  });

  test("the client source reads the same file, and a refusal as its code", async () => {
    const original = globalThis.fetch;
    const source = createHttpSource(TEST_DEF, BASE_PATH);
    const signal = new AbortController().signal;
    try {
      const handle = createHandler(createFake(2));
      globalThis.fetch = (async (input: string | URL) =>
        handle(String(input).slice(BASE_PATH.length))) as typeof fetch;
      const csv = await source.fetchExport(
        BASE,
        { columns: ["number"] },
        signal,
      );
      expect(csv).toBe(`${CSV_BOM}"Number"\r\n2\r\n1\r\n`);
      const refuse = createHandler(createFake(9), 5);
      globalThis.fetch = (async (input: string | URL) =>
        refuse(String(input).slice(BASE_PATH.length))) as typeof fetch;
      const refusal = await source
        .fetchExport(BASE, {}, signal)
        .catch((error: unknown) => error);
      expect(refusal).toMatchObject({
        code: "export_too_large",
        params: { limit: 5 },
      });
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("a host that wants no export", () => {
  test("sets the limit to zero and the route is not found", async () => {
    const fake = createFake(1);
    const response = await createHandler(fake, 0)("/export");
    expect(response.status).toBe(404);
    expect(fake.seen).toEqual([]);
  });
});

describe("walkExportPages", () => {
  test("walks the keyset in pages after one count, for a host's own encoder", async () => {
    const fake = createFake(2500);
    const sizes: number[] = [];
    for await (const rows of walkExportPages(TEST_DEF, fake.execute, {
      ...BASE,
      filters: [{ field: "region", op: "any_of", values: ["north"] }],
    })) {
      sizes.push(rows.length);
    }
    expect(sizes).toEqual([1000, 1000, 500]);
    expect(fake.seen).toHaveLength(4);
    expect(fake.seen[0].text).toContain("LIMIT 50001) capped");
    expect(fake.seen[1].text).toEndWith("LIMIT 1001");
  });

  test("a search exports what it returns and is refused past its own limit", async () => {
    const small = createFake(3);
    const pages: number[] = [];
    for await (const rows of walkExportPages(TEST_DEF, small.execute, {
      ...BASE,
      search: "name",
    })) {
      pages.push(rows.length);
    }
    expect(pages).toEqual([3]);
    const large = createFake(DEFAULT_LIMITS.searchLimit + 1);
    const refusal = await walkExportPages(TEST_DEF, large.execute, {
      ...BASE,
      search: "name",
    })
      .next()
      .catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(QueryRejected);
    expect(refusal).toMatchObject({
      code: "export_too_large",
      params: { limit: DEFAULT_LIMITS.searchLimit },
    });
  });
});
