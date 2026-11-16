import { describe, expect, test } from "bun:test";

import { createBoard, getLaneQueries, type Board } from "./board.ts";
import type { DataSource } from "./data-source.ts";
import type { GridRow } from "./grid-def.ts";
import type { QueryState } from "./query-state.ts";
import {
  createTestSource,
  settle,
  TEST_DEF,
  TEST_SEARCH_FIELDS,
  TEST_INDEXES,
} from "./grid-def.fixture.ts";
import { SourceError } from "./problems.ts";
import { defaultQuery } from "./query-actions.ts";
import { indexCapabilities } from "./indexes.ts";

const CAPABILITIES = indexCapabilities(TEST_INDEXES, {
  facetField: "status",
  searchFields: TEST_SEARCH_FIELDS,
});
const BASE = defaultQuery(TEST_DEF);

const ROWS: GridRow[] = [
  { id: "a", status: "open" },
  { id: "b", status: "open" },
  { id: "c", status: "done" },
];

interface Calls {
  transitions: number;
  moves: [string, string][];
}

function createSource(calls: Calls): DataSource {
  return createTestSource(CAPABILITIES, {
    fetchPage: async (query) => ({
      rows: ROWS.filter((row) =>
        query.equals.status?.includes(String(row.status)),
      ),
      nextCursor: null,
      hasNext: false,
    }),
    fetchTransitions: async () => {
      calls.transitions += 1;
      return [["open", "done"]];
    },
    changeFacetValue: async (id, to) => {
      calls.moves.push([id, to]);
      if (to === "open") {
        throw new SourceError("invalid_transition", {});
      }
      return { id, status: to };
    },
  });
}

function listLaneIds(board: Board): Record<string, string[]> {
  return Object.fromEntries(
    [...board.getState().lanes].map(([lane, feed]) => [
      lane,
      feed.rows.map((row) => row.id),
    ]),
  );
}

function listLanes(query: QueryState): string[] {
  return [
    ...(getLaneQueries(TEST_DEF, query, CAPABILITIES) ?? new Map()).keys(),
  ];
}

async function openBoard(source: DataSource): Promise<Board> {
  const queries = getLaneQueries(TEST_DEF, BASE, source.capabilities);
  const board = createBoard(TEST_DEF, source, queries ?? new Map());
  board.subscribe(() => undefined);
  await settle();
  return board;
}

describe("lane queries", () => {
  test("each facet value gets the default sort with that value alone", () => {
    const sorted: QueryState = {
      ...BASE,
      sort: { field: "total", direction: "asc" },
    };
    expect(listLanes(sorted)).toEqual(["open", "done"]);
    expect(getLaneQueries(TEST_DEF, sorted, CAPABILITIES)?.get("open")).toEqual(
      {
        ...BASE,
        equals: { status: ["open"] },
      },
    );
  });

  test("a selected facet value narrows the lanes", () => {
    expect(listLanes({ ...BASE, equals: { status: ["done"] } })).toEqual([
      "done",
    ]);
  });

  test("a search or an unanswerable lane leaves no board", () => {
    expect(
      getLaneQueries(TEST_DEF, { ...BASE, search: "abc" }, CAPABILITIES),
    ).toBeNull();
    expect(
      getLaneQueries(
        TEST_DEF,
        { ...BASE, equals: { region: ["north"] } },
        CAPABILITIES,
      ),
    ).toBeNull();
  });
});

describe("the board", () => {
  test("it loads each lane, and the transitions once per source", async () => {
    const calls: Calls = { transitions: 0, moves: [] };
    const source = createSource(calls);
    const board = await openBoard(source);
    expect(listLaneIds(board)).toEqual({ open: ["a", "b"], done: ["c"] });
    expect(board.getState().transitions).toEqual([["open", "done"]]);
    board.subscribe(() => undefined);
    const second = await openBoard(source);
    expect(second.getState().transitions).toEqual([["open", "done"]]);
    expect(calls.transitions).toBe(1);
  });

  test("transitions given to the board replace the source's", async () => {
    const calls: Calls = { transitions: 0, moves: [] };
    const source = createSource(calls);
    const queries = getLaneQueries(TEST_DEF, BASE, source.capabilities);
    const board = createBoard(TEST_DEF, source, queries ?? new Map(), [
      ["done", "open"],
    ]);
    board.subscribe(() => undefined);
    await settle();
    expect(calls.transitions).toBe(0);
    expect(board.canMove("done", "open")).toBe(true);
    expect(board.canMove("open", "done")).toBe(false);
  });

  test("a move is allowed only along a transition", async () => {
    const board = await openBoard(createSource({ transitions: 0, moves: [] }));
    expect(board.canMove("open", "done")).toBe(true);
    expect(board.canMove("done", "open")).toBe(false);
  });

  test("a move patches the two lanes with the returned row", async () => {
    const calls: Calls = { transitions: 0, moves: [] };
    const board = await openBoard(createSource(calls));
    const updated = await board.move({
      id: "a",
      from: "open",
      to: "done",
      index: 0,
    });
    expect(updated).toEqual({ id: "a", status: "done" });
    expect(calls.moves).toEqual([["a", "done"]]);
    expect(listLaneIds(board)).toEqual({ open: ["b"], done: ["a", "c"] });
  });

  test("a refused move leaves the lanes alone", async () => {
    const board = await openBoard(createSource({ transitions: 0, moves: [] }));
    const before = board.getState();
    const refused = board.move({ id: "c", from: "done", to: "open", index: 0 });
    await expect(refused).rejects.toThrow();
    expect(board.getState()).toBe(before);
  });
});
