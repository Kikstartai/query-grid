import { describe, expect, setSystemTime, test } from "bun:test";

import {
  DEFAULT_LIMITS,
  decodeQuery,
  encodeQuery,
  type GridRow,
  type QueryState,
} from "@kikstart/query-grid";
import { createHttpSource, type ErrorBody } from "@kikstart/query-grid/http";

import { TEST_DEF } from "./grid-def.fixture.ts";
import {
  createGridHandler,
  type GridHandlerConfig,
  type GridMoves,
} from "./grid-handler.ts";
import type { SqlExecutor } from "./query-runner.ts";
import { QueryRejected, type SqlQuery } from "./sql-builder.ts";

const ORIGIN = "http://grid.test";
const BASE_PATH = "/api/things";
const ID = "018f4b5e-0000-7000-8000-000000000001";
const ROW: GridRow = { id: ID, status: "open" };

interface Recorded {
  execute: SqlExecutor;
  seen: SqlQuery[];
}

function recordingExecutor(rows: object[]): Recorded {
  const seen: SqlQuery[] = [];
  const execute: SqlExecutor = async <T extends object>(sql: SqlQuery) => {
    seen.push(sql);
    return rows as T[];
  };
  return { execute, seen };
}

const MOVES: GridMoves = {
  transitions: async () => [["open", "done"]],
  change: async (id, to) => {
    if (to !== "done") {
      throw new QueryRejected("transition_refused", "transition_refused", {
        to,
      });
    }
    return { ...ROW, id, status: to };
  },
};

function createHandler(
  rows: object[],
  extra: Partial<GridHandlerConfig> = {},
): Recorded & {
  handle: (path: string, init?: RequestInit) => Promise<Response>;
} {
  const recorded = recordingExecutor(rows);
  const handler = createGridHandler({
    def: TEST_DEF,
    execute: recorded.execute,
    basePath: BASE_PATH,
    ...extra,
  });
  return {
    ...recorded,
    handle: (path, init) =>
      handler(new Request(`${ORIGIN}${BASE_PATH}${path}`, init)),
  };
}

function postStatus(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("the routes", () => {
  test("the base path answers a keyset page with the requested limit", async () => {
    const { handle, seen } = createHandler([ROW]);
    const response = await handle("?f.status=open&limit=25");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      rows: [ROW],
      nextCursor: null,
      hasNext: false,
    });
    expect(seen[0].text).toEndWith("LIMIT 26");
    expect(seen[0].values).toEqual(["open"]);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("server-timing")).toStartWith("db;dur=");
  });

  test("a missing limit is the default and a large one is capped", async () => {
    const { handle, seen } = createHandler([]);
    await handle("");
    await handle("?limit=100000");
    expect(seen[0].text).toEndWith("LIMIT 201");
    expect(seen[1].text).toEndWith("LIMIT 1001");
  });

  test("/count is capped, and exact on request", async () => {
    const { handle, seen } = createHandler([{ count: 12 }]);
    const capped = await handle("/count?f.region=north");
    expect(await capped.json()).toEqual({
      count: 12,
      capped: false,
      source: "capped",
    });
    const exact = await handle("/count?f.region=north&exact=1");
    expect(await exact.json()).toEqual({
      count: 12,
      capped: false,
      source: "exact",
    });
    expect(seen[0].text).toContain("LIMIT 10001");
    expect(seen[1].text).not.toContain("LIMIT");
  });

  test("/total answers one sum per total field, or a code each when none is available", async () => {
    const live = createHandler([
      { count: 3, total_sum: 900, number_sum: 3003 },
    ]);
    expect(await (await live.handle("/total?f.region=north")).json()).toEqual([
      { field: "total", available: true, sum: 900, rows: 3, source: "live" },
      { field: "number", available: true, sum: 3003, rows: 3, source: "live" },
    ]);
    const over = createHandler([{ count: 10001, total_sum: 1, number_sum: 1 }]);
    const refused = {
      available: false,
      code: "over_cap",
      params: { cap: 10000 },
    };
    expect(await (await over.handle("/total?f.region=north")).json()).toEqual([
      { field: "total", ...refused },
      { field: "number", ...refused },
    ]);
  });

  test("/facets reads the counter table and ignores the query", async () => {
    const counters = [
      { value: "open", count: 30, total_sum: 9000, number_sum: 30030 },
    ];
    const { handle, seen } = createHandler(counters);
    const response = await handle("/facets?f.region=north&sort=nope.asc");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { value: "open", count: 30, sums: { total: 9000, number: 30030 } },
    ]);
    expect(seen[0].values).toEqual([]);
  });

  test("/options and /transitions answer from the host hooks", async () => {
    const searches: unknown[] = [];
    const { handle } = createHandler([], {
      options: async (field, search) => {
        searches.push([field, search]);
        return [{ value: "a", label: "A" }];
      },
      moves: MOVES,
    });
    const options = await handle("/options?field=region&query=no");
    expect(await options.json()).toEqual([{ value: "a", label: "A" }]);
    expect(searches).toEqual([["region", { query: "no", value: undefined }]]);
    const transitions = await handle("/transitions");
    expect(await transitions.json()).toEqual([["open", "done"]]);
  });

  test("POST /status moves one row through the host hook", async () => {
    const { handle } = createHandler([], { moves: MOVES });
    const response = await handle(
      "/status",
      postStatus({ id: ID, to: "done" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: ID, status: "done" });
  });
});

describe("the URL codec", () => {
  test("a query encoded by core reaches the SQL through core's decoder", async () => {
    const query: QueryState = {
      equals: { status: ["open", "done"] },
      ranges: [{ field: "total", min: "100", max: null }],
      texts: [],
      overlaps: {},
      group: null,
      combine: "and",
      search: null,
      sort: { field: "total", direction: "asc" },
      cursor: null,
    };
    const params = encodeQuery(TEST_DEF, query);
    expect(decodeQuery(TEST_DEF, params)).toEqual(query);
    const { handle, seen } = createHandler([]);
    const response = await handle(`?${params}`);
    expect(response.status).toBe(200);
    expect(seen[0].text).toContain(
      "WHERE t.status = ANY($1::text[]) AND t.total >= $2::bigint ORDER BY t.total ASC",
    );
    expect(seen[0].values).toEqual([["open", "done"], "100"]);
  });

  test("the client source and the handler speak the same routes", async () => {
    const { handle, seen } = createHandler([{ count: 7 }]);
    const fetched: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input);
      fetched.push(url);
      return handle(url.slice(BASE_PATH.length), init);
    }) as typeof fetch;
    try {
      const source = createHttpSource(TEST_DEF, BASE_PATH);
      const signal = new AbortController().signal;
      const query: QueryState = {
        equals: { region: ["north", "south"] },
        ranges: [],
        texts: [],
        overlaps: {},
        group: null,
        combine: "and",
        search: null,
        sort: TEST_DEF.defaultSort,
        cursor: null,
      };
      expect(await source.fetchCount(query, false, signal)).toEqual({
        count: 7,
        capped: false,
        source: "capped",
      });
      expect(seen[0].values).toEqual([["north", "south"]]);
      await expect(
        source.fetchPage(
          { ...query, sort: { field: "total", direction: "asc" } },
          50,
          signal,
        ),
      ).rejects.toMatchObject({ code: "unindexed_query", params: {} });
    } finally {
      globalThis.fetch = original;
    }
    expect(fetched[0]).toBe(`${BASE_PATH}/count?f.region=north&f.region=south`);
  });
});

describe("refusals", () => {
  async function readError(response: Response): Promise<ErrorBody> {
    return (await response.json()) as ErrorBody;
  }

  test("an unindexed query is a 400 with a code and no SQL", async () => {
    const { handle, seen } = createHandler([]);
    const response = await handle("?f.region=north&sort=total.asc");
    expect(response.status).toBe(400);
    expect(await readError(response)).toEqual({
      error: "unindexed_query",
      message: "unindexed_query",
      code: "unindexed_query",
      params: {},
    });
    expect(seen).toEqual([]);
  });

  test("a value list past the cap is a 400 with the cap in params", async () => {
    const capped = {
      ...TEST_DEF,
      fields: TEST_DEF.fields.map((field) =>
        field.key === "status" ? { ...field, maxValues: 1 } : field,
      ),
    };
    const { handle, seen } = createHandler([], { def: capped });
    const response = await handle("?f.status=open&f.status=done");
    expect(response.status).toBe(400);
    expect(await readError(response)).toEqual({
      error: "invalid_value",
      message: "too_many_values field=status max=1",
      code: "too_many_values",
      params: { field: "status", max: 1 },
    });
    expect(seen).toEqual([]);
  });

  test("a field named like an object internal is a 400, not a crash", async () => {
    const { handle, seen } = createHandler([]);
    const response = await handle("?f.__proto__=x");
    expect(response.status).toBe(400);
    expect((await readError(response)).error).toBe("unindexed_query");
    expect(seen).toEqual([]);
  });

  test("a bad value is a 400 that names the field in params", async () => {
    const { handle } = createHandler([]);
    const response = await handle("?f.status=nope");
    expect(response.status).toBe(400);
    expect(await readError(response)).toEqual({
      error: "invalid_value",
      message: "invalid_value field=status",
      code: "invalid_value",
      params: { field: "status" },
    });
  });

  test("a non-numeric limit is a 400, never LIMIT NaN", async () => {
    const { handle, seen } = createHandler([]);
    for (const limit of ["abc", "1.5", "-3", "0", "", "1e3"]) {
      const response = await handle(`?limit=${limit}`);
      expect(response.status).toBe(400);
      expect((await readError(response)).code).toBe("invalid_limit");
    }
    expect(seen).toEqual([]);
  });

  test("a search past its budget is a 400 too_broad", async () => {
    const canceled: SqlExecutor = async () => {
      throw Object.assign(new Error("canceling statement"), { code: "57014" });
    };
    const handler = createGridHandler({ def: TEST_DEF, execute: canceled });
    const response = await handler(new Request(`${ORIGIN}${BASE_PATH}?q=---`));
    expect(response.status).toBe(400);
    expect((await readError(response)).error).toBe("too_broad");
  });

  test("every read runs under the signal of its request", async () => {
    const signals: (AbortSignal | undefined)[] = [];
    const execute: SqlExecutor = async <T extends object>(
      _sql: SqlQuery,
      _settings?: string[],
      signal?: AbortSignal,
    ) => {
      signals.push(signal);
      return [{ value: "open", count: 1, total_sum: 1, number_sum: 1 }] as T[];
    };
    const handler = createGridHandler({
      def: TEST_DEF,
      execute,
      basePath: BASE_PATH,
      options: async (_field, _search, signal) => {
        signals.push(signal);
        return [];
      },
      moves: {
        ...MOVES,
        transitions: async (signal) => {
          signals.push(signal);
          return [];
        },
      },
    });
    const paths = [
      "",
      "/count?f.region=north",
      "/total?f.region=north",
      "/facets",
      "/options?field=region",
      "/transitions",
    ];
    for (const path of paths) {
      const request = new Request(`${ORIGIN}${BASE_PATH}${path}`);
      expect((await handler(request)).status).toBe(200);
      expect(signals.at(-1)).toBe(request.signal);
    }
    expect(signals).toHaveLength(paths.length);
  });

  test("a request aborted mid-query is no too_broad, no 500 and no report", async () => {
    const reported: unknown[] = [];
    const controller = new AbortController();
    const canceled: SqlExecutor = async () => {
      controller.abort();
      throw Object.assign(new Error("canceling statement"), { code: "57014" });
    };
    const handler = createGridHandler({
      def: TEST_DEF,
      execute: canceled,
      onError: (error) => reported.push(error),
    });
    for (const path of ["?q=acme", ""]) {
      const response = await handler(
        new Request(`${ORIGIN}${BASE_PATH}${path}`, {
          signal: controller.signal,
        }),
      );
      expect(response.status).toBe(499);
      expect(await response.text()).toBe("");
    }
    expect(reported).toEqual([]);
  });

  test("the abort's own reason is not reported, whatever a server calls it", async () => {
    const reported: unknown[] = [];
    const controller = new AbortController();
    const aborting: SqlExecutor = async (_sql, _settings, signal) => {
      controller.abort(
        Object.assign(new Error(""), { name: "ResponseAborted" }),
      );
      signal?.throwIfAborted();
      return [];
    };
    const handler = createGridHandler({
      def: TEST_DEF,
      execute: aborting,
      onError: (error) => reported.push(error),
    });
    const response = await handler(
      new Request(`${ORIGIN}${BASE_PATH}`, { signal: controller.signal }),
    );
    expect(response.status).toBe(499);
    expect(reported).toEqual([]);
  });

  test("a failure that is not the abort is still reported when the client has gone", async () => {
    const reported: unknown[] = [];
    const controller = new AbortController();
    const broken: SqlExecutor = async () => {
      controller.abort();
      throw new Error("relation does not exist");
    };
    const handler = createGridHandler({
      def: TEST_DEF,
      execute: broken,
      onError: (error) => reported.push(error),
    });
    const response = await handler(
      new Request(`${ORIGIN}${BASE_PATH}`, { signal: controller.signal }),
    );
    expect(response.status).toBe(499);
    expect(reported).toHaveLength(1);
  });

  test("an executor that rejects with nothing after the client has gone is reported", async () => {
    for (const rejection of [null, undefined]) {
      const reported: unknown[] = [];
      const controller = new AbortController();
      const empty: SqlExecutor = () => {
        controller.abort();
        return Promise.reject(rejection);
      };
      const handler = createGridHandler({
        def: TEST_DEF,
        execute: empty,
        onError: (error) => reported.push(error),
      });
      const response = await handler(
        new Request(`${ORIGIN}${BASE_PATH}`, { signal: controller.signal }),
      );
      expect(response.status).toBe(499);
      expect(reported).toEqual([rejection]);
    }
  });

  test("an omitted hook is a 404, and so is an unknown route", async () => {
    const { handle } = createHandler([]);
    for (const path of ["/options?field=region", "/transitions", "/nope"]) {
      const response = await handle(path);
      expect(response.status).toBe(404);
      expect((await readError(response)).error).toBe("not_found");
    }
    const status = await handle("/status", postStatus({ id: ID, to: "done" }));
    expect(status.status).toBe(404);
  });

  test("the wrong method is a 405", async () => {
    const { handle } = createHandler([], { moves: MOVES });
    expect((await handle("/status")).status).toBe(405);
    expect((await handle("/count", { method: "POST" })).status).toBe(405);
  });

  test("a refused transition is a 409", async () => {
    const { handle } = createHandler([], { moves: MOVES });
    const response = await handle(
      "/status",
      postStatus({ id: ID, to: "open" }),
    );
    expect(response.status).toBe(409);
    expect(await readError(response)).toEqual({
      error: "transition_refused",
      message: "transition_refused to=open",
      code: "transition_refused",
      params: { to: "open" },
    });
  });

  test("a malformed move is a 400 before the hook runs", async () => {
    const { handle } = createHandler([], { moves: MOVES });
    for (const body of [
      null,
      { id: "x", to: "done" },
      { id: ID, to: "nope" },
    ]) {
      const response = await handle("/status", postStatus(body));
      expect(response.status).toBe(400);
      expect((await readError(response)).error).toBe("invalid_value");
    }
  });

  test("any other failure is a 500 that carries no detail", async () => {
    const reported: unknown[] = [];
    const failing: SqlExecutor = async () => {
      throw new Error("connection reset by 10.0.0.7");
    };
    const handler = createGridHandler({
      def: TEST_DEF,
      execute: failing,
      onError: (error) => reported.push(error),
    });
    const response = await handler(new Request(`${ORIGIN}${BASE_PATH}`));
    expect(response.status).toBe(500);
    expect(await readError(response)).toEqual({
      error: "internal",
      message: "internal",
      code: "internal",
      params: {},
    });
    expect(reported).toHaveLength(1);
  });
});

describe("routing without a base path", () => {
  test("the last path segment picks the route", async () => {
    const { execute, seen } = recordingExecutor([{ count: 1 }]);
    const handler = createGridHandler({ def: TEST_DEF, execute });
    const count = await handler(new Request(`${ORIGIN}/any/where/count`));
    expect(((await count.json()) as { source: string }).source).toBe("counter");
    const page = await handler(new Request(`${ORIGIN}/any/where`));
    expect(page.status).toBe(200);
    expect(seen).toHaveLength(2);
  });
});

describe("limits", () => {
  test("/limits answers the defaults when the host sets none", async () => {
    const { handle, seen } = createHandler([]);
    const response = await handle("/limits");
    expect(await response.json()).toEqual(DEFAULT_LIMITS);
    expect(seen).toEqual([]);
  });

  test("/limits answers the host's limits and the source reads them", async () => {
    const { handle } = createHandler([], { limits: { countCap: 250 } });
    const response = await handle("/limits");
    expect(await response.json()).toEqual({ ...DEFAULT_LIMITS, countCap: 250 });
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL) =>
      handle(String(input).slice(BASE_PATH.length))) as typeof fetch;
    try {
      const source = createHttpSource(TEST_DEF, BASE_PATH);
      const limits = await source.fetchLimits(new AbortController().signal);
      expect(limits?.countCap).toBe(250);
    } finally {
      globalThis.fetch = original;
    }
  });

  test("every limit shapes its own statement", async () => {
    const settings: (string[] | undefined)[] = [];
    const seen: SqlQuery[] = [];
    const execute: SqlExecutor = async <T extends object>(
      sql: SqlQuery,
      given?: string[],
    ) => {
      seen.push(sql);
      settings.push(given);
      return [{ count: 3 }] as T[];
    };
    const handler = createGridHandler({
      def: TEST_DEF,
      execute,
      basePath: BASE_PATH,
      limits: {
        pageLimit: 40,
        countCap: 250,
        searchLimit: 30,
        searchBudgetMs: 75,
      },
    });
    const get = (path: string) =>
      handler(new Request(`${ORIGIN}${BASE_PATH}${path}`));
    await get("");
    await get("/count?f.region=north");
    await get("?q=smith");
    await get("/count?q=smith");
    expect(seen[0].text).toEndWith("LIMIT 41");
    expect(seen[1].text).toContain("LIMIT 251");
    expect(seen[2].text).toEndWith("LIMIT 31");
    expect(seen[3].text).toContain("LIMIT 31");
    expect(settings[2]).toContain("statement_timeout = 75");
    expect(settings[0]).toBeUndefined();
  });

  test("a limit that is no positive integer fails when the handler is made", () => {
    expect(() =>
      createGridHandler({
        def: TEST_DEF,
        execute: async () => [],
        limits: { narrowLimit: -1 },
      }),
    ).toThrow("narrowLimit");
  });
});

describe("intent the browser resolves", () => {
  async function readError(response: Response): Promise<ErrorBody> {
    return (await response.json()) as ErrorBody;
  }

  test("an excluded value is refused: the server sees plain values only", async () => {
    const { handle, seen } = createHandler([]);
    const response = await handle("?f.status=!open");
    expect(response.status).toBe(400);
    expect(await readError(response)).toMatchObject({
      error: "invalid_value",
      params: { field: "status" },
    });
    expect(seen).toEqual([]);
  });

  test("a preset name is refused: the server sees bounds only", async () => {
    const { handle, seen } = createHandler([]);
    const response = await handle("?r.created_at=last-7-days");
    expect(response.status).toBe(400);
    expect((await readError(response)).error).toBe("invalid_value");
    expect(seen).toEqual([]);
  });

  test("the source sends the remaining values and the resolved bounds", async () => {
    const { handle, seen } = createHandler([{ count: 1 }]);
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL) =>
      handle(String(input).slice(BASE_PATH.length))) as typeof fetch;
    setSystemTime(new Date(2026, 10, 15, 12));
    try {
      const source = createHttpSource(TEST_DEF, BASE_PATH);
      const signal = new AbortController().signal;
      const query: QueryState = {
        equals: { status: ["!open"] },
        ranges: [],
        texts: [],
        overlaps: {},
        group: null,
        combine: "and",
        search: null,
        sort: TEST_DEF.defaultSort,
        cursor: null,
      };
      expect(source.capabilities.canRun(query)).toBe(true);
      await source.fetchPage(query, 10, signal);
      expect(seen[0].values).toEqual(["done"]);
      await source.fetchPage(
        {
          ...query,
          equals: {},
          ranges: [
            { field: "created_at", min: null, max: null, preset: "today" },
          ],
        },
        10,
        signal,
      );
      expect(seen[1].values).toEqual([
        new Date(2026, 10, 15).toISOString(),
        new Date(new Date(2026, 10, 16).getTime() - 1)
          .toISOString()
          .replace(".999Z", ".999999Z"),
      ]);
    } finally {
      globalThis.fetch = original;
      setSystemTime();
    }
  });
});

describe("search with equality filters", () => {
  function recording(rows: object[]) {
    const seen: SqlQuery[] = [];
    const settings: (string[] | undefined)[] = [];
    const execute: SqlExecutor = async <T extends object>(
      sql: SqlQuery,
      given?: string[],
    ) => {
      seen.push(sql);
      settings.push(given);
      return rows as T[];
    };
    const handler = createGridHandler({
      def: TEST_DEF,
      execute,
      basePath: BASE_PATH,
    });
    return {
      seen,
      settings,
      get: (path: string) =>
        handler(new Request(`${ORIGIN}${BASE_PATH}${path}`)),
    };
  }

  test("the filters AND with the search, under the search budget and limit", async () => {
    const { get, seen, settings } = recording([ROW]);
    const response = await get(
      "?q=smith&f.status=open&f.region=north&f.region=south",
    );
    expect(response.status).toBe(200);
    expect(seen[0].text).toContain(
      "WHERE t.status = $1::text AND t.region = ANY($2::text[]) AND (t.name || ' ' || t.number::text) ILIKE $3 LIMIT 501",
    );
    expect(seen[0].text).not.toContain("ORDER BY");
    expect(seen[0].values).toEqual(["open", ["north", "south"], "%smith%"]);
    expect(settings[0]).toContain("statement_timeout = 120");
  });

  test("the count and the totals are capped at the search limit, never read from the counter", async () => {
    const { get, seen } = recording([
      { count: 7, total_sum: 1, number_sum: 2 },
    ]);
    const count = await get("/count?q=smith&f.status=open");
    expect(await count.json()).toEqual({
      count: 7,
      capped: false,
      source: "capped",
    });
    expect(seen[0].text).toContain("LIMIT 501");
    const total = await get("/total?q=smith&f.status=open");
    expect(((await total.json()) as { source: string }[])[0].source).toBe(
      "live",
    );
    expect(seen[1].text).toContain("LIMIT 501");
  });

  test("an empty value and several values combine with the search too", async () => {
    const def = {
      ...TEST_DEF,
      indexes: [...TEST_DEF.indexes, { equals: ["note"], sort: "created_at" }],
    };
    const seen: SqlQuery[] = [];
    const handler = createGridHandler({
      def,
      execute: async <T extends object>(sql: SqlQuery) => {
        seen.push(sql);
        return [] as T[];
      },
      basePath: BASE_PATH,
    });
    const response = await handler(
      new Request(`${ORIGIN}${BASE_PATH}?q=smith&f.note=_empty`),
    );
    expect(response.status).toBe(200);
    expect(seen[0].text).toContain("WHERE t.note IS NULL AND (");
  });

  test("a range beside the search, and a filter on a field no index holds, are refused", async () => {
    const { get, seen } = recording([]);
    const ranged = await get("?q=smith&r.created_at=2026-01-01..");
    expect(ranged.status).toBe(400);
    const unindexed = await get("?q=smith&f.name=Ann");
    expect(unindexed.status).toBe(400);
    expect(seen).toEqual([]);
  });
});
