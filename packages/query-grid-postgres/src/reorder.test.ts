import { describe, expect, test } from "bun:test";

import type { GridRow } from "@kikstart/query-grid";
import {
  createHttpSource,
  type ErrorBody,
  type ReorderBody,
} from "@kikstart/query-grid/http";

import { TEST_DEF } from "./grid-def.fixture.ts";
import { createGridHandler, type GridReorder } from "./grid-handler.ts";
import { QueryRejected } from "./sql-builder.ts";

const ORIGIN = "http://grid.test";
const BASE_PATH = "/api/things";
const A = "018f4b5e-0000-7000-8000-000000000001";
const B = "018f4b5e-0000-7000-8000-000000000002";
const C = "018f4b5e-0000-7000-8000-000000000003";

function post(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function createHandler(reorder?: GridReorder) {
  const handler = createGridHandler({
    def: TEST_DEF,
    execute: async () => [],
    basePath: BASE_PATH,
    reorder,
    onError: () => undefined,
  });
  return (path: string, init?: RequestInit) =>
    handler(new Request(`${ORIGIN}${BASE_PATH}${path}`, init));
}

describe("POST /order", () => {
  test("hands the move to the host hook and answers the rows it changed", async () => {
    const seen: ReorderBody[] = [];
    const handle = createHandler({
      move: async (move) => {
        seen.push(move);
        return [{ id: move.id, number: 2 }];
      },
    });
    const response = await handle(
      "/order",
      post({ id: A, after: B, before: C }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: A, number: 2 }]);
    expect(seen).toEqual([{ id: A, after: B, before: C }]);
    await handle("/order", post({ id: A, before: C }));
    expect(seen[1]).toEqual({ id: A, after: null, before: C });
  });

  test("a body with a bad id, or with no neighbour at all, never reaches the hook", async () => {
    let calls = 0;
    const handle = createHandler({
      move: async () => {
        calls += 1;
        return [];
      },
    });
    const bodies = [
      { id: "nope", after: B },
      { id: A, after: "x; DROP TABLE things" },
      { id: A, before: 7 },
      { id: A },
      { id: A, after: A },
      { id: A, after: B, before: B },
      null,
    ];
    for (const body of bodies) {
      const response = await handle("/order", post(body));
      expect(response.status).toBe(400);
      expect(((await response.json()) as ErrorBody).code).toBe("invalid_value");
    }
    expect(calls).toBe(0);
  });

  test("without the hook it is a 404, a GET is a 405 and a host refusal keeps its code", async () => {
    expect(
      (await createHandler()("/order", post({ id: A, after: B }))).status,
    ).toBe(404);
    const handle = createHandler({
      move: async () => {
        throw new QueryRejected("invalid_value", "order_locked", { id: A });
      },
    });
    expect((await handle("/order")).status).toBe(405);
    const refused = await handle("/order", post({ id: A, after: B }));
    expect(refused.status).toBe(400);
    expect((await refused.json()) as ErrorBody).toMatchObject({
      code: "order_locked",
      params: { id: A },
    });
  });

  test("the client source posts the move and reads the rows back", async () => {
    const original = globalThis.fetch;
    const handle = createHandler({
      move: async (move): Promise<GridRow[]> => [{ id: move.id, number: 9 }],
    });
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) =>
      handle(String(input).slice(BASE_PATH.length), init)) as typeof fetch;
    try {
      const source = createHttpSource(TEST_DEF, BASE_PATH);
      const changed = await source.reorderRow({
        id: A,
        index: 1,
        after: B,
        before: null,
      });
      expect(changed).toEqual([{ id: A, number: 9 }]);
    } finally {
      globalThis.fetch = original;
    }
  });
});
