import { describe, expect, test } from "bun:test";

import { TEST_DEF } from "./grid-def.fixture.ts";
import type { BaseGridDef, GridRow } from "./grid-def.ts";
import { createMemorySource } from "./memory-source.ts";
import { defaultQuery } from "./query-actions.ts";
import {
  canReorder,
  explainReorder,
  reorderRows,
  resolveRowMove,
} from "./reorder.ts";

const DEF: BaseGridDef = { ...TEST_DEF, orderField: "number" };
const WHOLE = { loaded: true, hasNext: false };
const ORDERED = {
  ...defaultQuery(DEF),
  sort: { field: "number", direction: "asc" as const },
};

function rows(): GridRow[] {
  return ["a", "b", "c", "d", "e"].map((id, at) => ({
    id,
    number: (at + 1) * 10,
    status: at % 2 === 0 ? "open" : "done",
  }));
}

describe("when a manual order may be changed", () => {
  test("only a def with an order field reorders at all", () => {
    expect(canReorder(TEST_DEF)).toBe(false);
    expect(canReorder(DEF)).toBe(true);
    expect(canReorder({ ...TEST_DEF, orderField: "nope" })).toBe(false);
  });

  test("sorted ascending by the order field, with every row in hand, it is allowed", () => {
    expect(explainReorder(DEF, ORDERED, WHOLE)).toBeNull();
    expect(
      explainReorder(DEF, { ...ORDERED, equals: { status: ["open"] } }, WHOLE),
    ).toBeNull();
  });

  test("another sort, a direction or a further column needs the order back", () => {
    const needs = { code: "reorder_needs_order", params: { field: "number" } };
    expect(explainReorder(DEF, defaultQuery(DEF), WHOLE)).toEqual(needs);
    expect(
      explainReorder(
        DEF,
        { ...ORDERED, sort: { field: "number", direction: "desc" } },
        WHOLE,
      ),
    ).toEqual(needs);
    expect(
      explainReorder(
        DEF,
        { ...ORDERED, thenBy: [{ field: "total", direction: "asc" }] },
        WHOLE,
      ),
    ).toEqual(needs);
  });

  test("a set that is not whole, or still loading, or grouped is held", () => {
    expect(
      explainReorder(DEF, ORDERED, { loaded: true, hasNext: true })?.code,
    ).toBe("reorder_needs_all_rows");
    expect(
      explainReorder(DEF, ORDERED, { loaded: false, hasNext: false })?.code,
    ).toBe("reorder_needs_all_rows");
    expect(
      explainReorder(DEF, { ...ORDERED, group: "status" }, WHOLE)?.code,
    ).toBe("reorder_grouped");
  });
});

describe("a move between two orders", () => {
  test("names the row, its new place and its new neighbours", () => {
    expect(resolveRowMove(["a", "b", "c", "d"], ["b", "c", "a", "d"])).toEqual({
      id: "a",
      index: 2,
      after: "c",
      before: "d",
    });
    expect(resolveRowMove(["a", "b", "c", "d"], ["d", "a", "b", "c"])).toEqual({
      id: "d",
      index: 0,
      after: null,
      before: "a",
    });
    expect(resolveRowMove(["a", "b", "c"], ["a", "c", "b"])).toMatchObject({
      index: 2,
      after: "c",
      before: null,
    });
  });

  test("the same order, or one that is no single move, is no move", () => {
    expect(resolveRowMove(["a", "b"], ["a", "b"])).toBeNull();
    expect(
      resolveRowMove(["a", "b", "c", "d"], ["d", "c", "b", "a"]),
    ).toBeNull();
    expect(resolveRowMove(["a", "b"], ["a"])).toBeNull();
  });
});

describe("the order values after a move", () => {
  test("the same values are dealt out again, and only the rows that changed come back", () => {
    const changed = reorderRows("number", rows(), {
      id: "d",
      index: 1,
      after: "a",
      before: "b",
    });
    expect(changed.map((row) => [row.id, row.number])).toEqual([
      ["d", 20],
      ["b", 30],
      ["c", 40],
    ]);
  });

  test("a move to the top goes before its new neighbour", () => {
    const changed = reorderRows("number", rows(), {
      id: "c",
      index: 0,
      after: null,
      before: "a",
    });
    expect(changed.map((row) => [row.id, row.number])).toEqual([
      ["c", 10],
      ["a", 20],
      ["b", 30],
    ]);
  });

  test("under a filter the moved row lands beside its visible neighbour and hidden rows keep a place", () => {
    const changed = reorderRows("number", rows(), {
      id: "e",
      index: 1,
      after: "a",
      before: "c",
    });
    expect(changed.map((row) => row.id)).toEqual(["e", "b", "c", "d"]);
  });

  test("values that repeat or are missing are numbered afresh, so the move still lands", () => {
    const tied: GridRow[] = [
      { id: "a", number: 1 },
      { id: "b", number: 1 },
      { id: "c", number: 2 },
    ];
    const first = reorderRows("number", tied, {
      id: "b",
      index: 0,
      after: null,
      before: "a",
    });
    expect(first.map((row) => [row.id, row.number])).toEqual([
      ["a", 2],
      ["c", 3],
    ]);
    const empty: GridRow[] = ["x", "y", "z"].map((id) => ({
      id,
      number: null,
    }));
    const numbered = reorderRows("number", empty, {
      id: "z",
      index: 0,
      after: null,
      before: "x",
    });
    expect(numbered.map((row) => [row.id, row.number])).toEqual([
      ["z", 1],
      ["x", 2],
      ["y", 3],
    ]);
  });

  test("an unknown row or neighbour changes nothing", () => {
    expect(
      reorderRows("number", rows(), {
        id: "z",
        index: 0,
        after: null,
        before: "a",
      }),
    ).toEqual([]);
    expect(
      reorderRows("number", rows(), {
        id: "a",
        index: 0,
        after: "z",
        before: null,
      }),
    ).toEqual([]);
  });
});

describe("the in-memory source saves a move", () => {
  test("the next page is in the new order", async () => {
    const source = createMemorySource(DEF, rows());
    const signal = new AbortController().signal;
    const changed = await source.reorderRow({
      id: "e",
      index: 0,
      after: null,
      before: "a",
    });
    expect(changed).toHaveLength(5);
    const page = await source.fetchPage(ORDERED, 10, signal);
    expect(page.rows.map((row) => row.id)).toEqual(["e", "a", "b", "c", "d"]);
    expect(page.rows.map((row) => row.number)).toEqual([10, 20, 30, 40, 50]);
  });

  test("a def with no order field, or an unknown row, is refused", async () => {
    const plain = createMemorySource(TEST_DEF, rows());
    const move = { id: "a", index: 1, after: "b", before: "c" };
    await expect(plain.reorderRow(move)).rejects.toMatchObject({
      code: "unknown_row",
    });
    const source = createMemorySource(DEF, rows());
    await expect(
      source.reorderRow({ ...move, id: "nope" }),
    ).rejects.toMatchObject({ code: "unknown_row" });
  });
});
