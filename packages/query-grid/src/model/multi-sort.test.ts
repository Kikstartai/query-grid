import { describe, expect, test } from "bun:test";

import type { NarrowedState, OfferContext } from "./capabilities.ts";
import { listFilterChips } from "./chips.ts";
import { TEST_DEF, TEST_INDEXES } from "./grid-def.fixture.ts";
import type { GridRow, IndexDef, IndexedGridDef } from "./grid-def.ts";
import {
  getIndex,
  gridDefCapabilities,
  indexId,
  isQueryRunnable,
  planQuery,
} from "./indexes.ts";
import { createMemorySource } from "./memory-source.ts";
import {
  applyAction,
  defaultQuery,
  explainUnavailable,
  listOffers,
} from "./query-actions.ts";
import { listSorts, type QueryState } from "./query-state.ts";
import { decodeQuery, encodeQuery } from "./query-url.ts";
import { validateQueryValues } from "./query-validate.ts";

const COMPOSITE: IndexDef = { equals: [], sort: "number", then: ["total"] };
const INDEXES: IndexDef[] = [...TEST_INDEXES, COMPOSITE];
const DEF: IndexedGridDef = { ...TEST_DEF, indexes: INDEXES };
const BASE = defaultQuery(DEF);
const CAPABILITIES = gridDefCapabilities(DEF);

function sorted(
  sorts: [string, "asc" | "desc"][],
  query: QueryState = BASE,
): QueryState {
  const [sort, ...thenBy] = sorts.map(([field, direction]) => ({
    field,
    direction,
  }));
  return { ...query, sort, thenBy: thenBy.length > 0 ? thenBy : undefined };
}

function context(rows: number | null): OfferContext {
  const basis = CAPABILITIES.narrowBasis(BASE);
  const narrowed: NarrowedState | null =
    rows === null
      ? null
      : {
          limit: 100,
          all: { rows, over: rows > 100, capped: rows > 100 },
          any: null,
          allBasis: basis,
          anyBasis: "",
        };
  return {
    capabilities: CAPABILITIES,
    allSearchMatchesLoaded: false,
    narrowed,
  };
}

describe("an index declares a composite order", () => {
  test("the order is part of the index's identity", () => {
    expect(indexId(COMPOSITE)).toBe("|number>total");
    expect(indexId({ equals: [], sort: "number" })).toBe("|number");
  });

  test("it answers its columns in one direction, either way", () => {
    for (const direction of ["asc", "desc"] as const) {
      const query = sorted([
        ["number", direction],
        ["total", direction],
      ]);
      expect(getIndex(INDEXES, query)).toBe(COMPOSITE);
      expect(planQuery(INDEXES, query)?.narrowed).toBe(false);
    }
  });

  test("it does not answer its first column alone, or mixed directions", () => {
    expect(getIndex(INDEXES, sorted([["number", "asc"]]))).toBeNull();
    const mixed = sorted([
      ["number", "asc"],
      ["total", "desc"],
    ]);
    expect(getIndex(INDEXES, mixed)).toBeNull();
    expect(isQueryRunnable(DEF, mixed)).toBe(false);
  });

  test("the capabilities list the order and the columns a further sort takes", () => {
    expect(CAPABILITIES.sortOrders).toEqual([["number", "total"]]);
    expect(CAPABILITIES.sortFields).toContain("number");
    expect(CAPABILITIES.thenByFields).toEqual([
      "number",
      "created_at",
      "total",
      "status",
      "region",
      "name",
    ]);
  });
});

describe("a further sort column with no index", () => {
  const query = sorted([
    ["created_at", "desc"],
    ["total", "asc"],
  ]);

  test("runs over the narrowed set, on the first column's index", () => {
    const plan = planQuery(INDEXES, query);
    expect(plan?.narrowed).toBe(true);
    expect(plan?.core.thenBy).toBeUndefined();
    expect(plan?.core.sort.field).toBe("created_at");
    expect(CAPABILITIES.isNarrowed(query)).toBe(true);
    expect(CAPABILITIES.canRun(query)).toBe(true);
  });

  test("a text filter with an index joins the narrowed set, so the size probe never reads that index", () => {
    const extras = { textIndexes: ["name"] };
    const texted: QueryState = {
      ...query,
      texts: [{ field: "name", op: "contains", value: "acme" }],
    };
    const plan = planQuery(INDEXES, texted, extras);
    expect(plan).toMatchObject({ narrowed: true, budgeted: false });
    expect(plan?.core.texts).toEqual([]);
    const alone = planQuery(INDEXES, { ...texted, thenBy: undefined }, extras);
    expect(alone).toMatchObject({ narrowed: false, budgeted: true });
  });

  test("match any still counts each filter through its own index", () => {
    const either: QueryState = {
      ...query,
      match: "any",
      equals: { status: ["open"], region: ["north"] },
    };
    const plan = planQuery(INDEXES, either);
    expect(plan?.terms).toHaveLength(2);
    expect(plan?.terms?.every((term) => term.thenBy === undefined)).toBe(true);
  });

  test("the core keeps a range on the first column before it keeps the order", () => {
    const ranged: QueryState = {
      ...sorted([
        ["number", "asc"],
        ["total", "asc"],
      ]),
      ranges: [{ field: "number", min: "5", max: "9" }],
    };
    const indexes = [...INDEXES, { equals: [], sort: "number", range: true }];
    const plan = planQuery(indexes, ranged);
    expect(plan?.narrowed).toBe(true);
    expect(plan?.core.ranges).toHaveLength(1);
    expect(plan?.core.thenBy).toBeUndefined();
  });

  test("a nullable, an array or a repeated column is refused", () => {
    expect(
      CAPABILITIES.canRun(
        sorted([
          ["created_at", "desc"],
          ["note", "asc"],
        ]),
      ),
    ).toBe(false);
    expect(
      CAPABILITIES.canRun(
        sorted([
          ["created_at", "desc"],
          ["created_at", "asc"],
        ]),
      ),
    ).toBe(false);
    expect(
      CAPABILITIES.canRun(
        sorted([
          ["created_at", "desc"],
          ["total", "asc"],
          ["number", "asc"],
          ["name", "asc"],
        ]),
      ),
    ).toBe(false);
  });

  test("is offered only once the set is known to be small enough", () => {
    expect(listOffers(DEF, BASE, context(null)).thenBy).toEqual([]);
    expect(listOffers(DEF, BASE, context(5000)).thenBy).toEqual([]);
    expect(listOffers(DEF, BASE, context(40)).thenBy).toEqual([
      "number",
      "total",
      "status",
      "region",
      "name",
    ]);
    expect(
      explainUnavailable(
        BASE,
        { kind: "thenBy", field: "total" },
        context(5000),
      ),
    ).toMatchObject({ code: "narrow_first", rows: 5000, capped: true });
  });

  test("addSort appends, turns and is refused past the limit", () => {
    const small = context(40);
    const two = applyAction(
      DEF,
      BASE,
      { type: "addSort", field: "total", direction: "asc" },
      small,
    );
    expect(listSorts(two)).toEqual([
      { field: "created_at", direction: "desc" },
      { field: "total", direction: "asc" },
    ]);
    const turned = applyAction(
      DEF,
      two,
      { type: "addSort", field: "total", direction: "desc" },
      small,
    );
    expect(turned.thenBy).toEqual([{ field: "total", direction: "desc" }]);
    const three = applyAction(
      DEF,
      two,
      { type: "addSort", field: "name", direction: "asc" },
      small,
    );
    expect(listSorts(three)).toHaveLength(3);
    const four = applyAction(
      DEF,
      three,
      { type: "addSort", field: "region", direction: "asc" },
      small,
    );
    expect(four).toBe(three);
    expect(
      explainUnavailable(three, { kind: "thenBy", field: "region" }, small)
        .code,
    ).toBe("sort_limit");
  });

  test("removeSort drops one column, and the first promotes the next", () => {
    const small = context(40);
    const two = sorted([
      ["created_at", "desc"],
      ["total", "asc"],
    ]);
    expect(
      applyAction(DEF, two, { type: "removeSort", field: "total" }, small)
        .thenBy,
    ).toBeUndefined();
    const promoted = applyAction(
      DEF,
      two,
      { type: "removeSort", field: "created_at" },
      small,
    );
    expect(listSorts(promoted)).toEqual([{ field: "total", direction: "asc" }]);
  });
});

describe("the sort action reaches a declared order", () => {
  test("a column only a composite index sorts brings the rest of its order", () => {
    const next = applyAction(
      DEF,
      BASE,
      { type: "setSort", field: "number", direction: "asc" },
      context(null),
    );
    expect(listSorts(next)).toEqual([
      { field: "number", direction: "asc" },
      { field: "total", direction: "asc" },
    ]);
    expect(listOffers(DEF, BASE, context(null)).sorts).toContain("number");
  });

  test("turning the first column turns the whole order when only that runs", () => {
    const composite = sorted([
      ["number", "asc"],
      ["total", "asc"],
    ]);
    const turned = applyAction(
      DEF,
      composite,
      { type: "addSort", field: "number", direction: "desc" },
      context(null),
    );
    expect(listSorts(turned)).toEqual([
      { field: "number", direction: "desc" },
      { field: "total", direction: "desc" },
    ]);
  });

  test("a plain sort clears the further columns", () => {
    const next = applyAction(
      DEF,
      sorted([
        ["number", "asc"],
        ["total", "asc"],
      ]),
      { type: "setSort", field: "total", direction: "desc" },
      context(null),
    );
    expect(listSorts(next)).toEqual([{ field: "total", direction: "desc" }]);
  });
});

describe("the sort in the URL, the validator and the chips", () => {
  const query = sorted([
    ["number", "asc"],
    ["total", "desc"],
  ]);

  test("the URL lists every column and reads back the same", () => {
    const params = encodeQuery(DEF, query);
    expect(params.get("sort")).toBe("number.asc,total.desc");
    expect(decodeQuery(DEF, params)).toEqual(query);
    expect(decodeQuery(DEF, new URLSearchParams("")).thenBy).toBeUndefined();
    expect(
      encodeQuery(
        DEF,
        sorted([
          ["created_at", "desc"],
          ["total", "asc"],
        ]),
      ).get("sort"),
    ).toBe("created_at.desc,total.asc");
  });

  test("the validator refuses too many, unknown and repeated columns", () => {
    expect(validateQueryValues(DEF, query)).toBeNull();
    expect(
      validateQueryValues(
        DEF,
        sorted([
          ["number", "asc"],
          ["total", "asc"],
          ["name", "asc"],
          ["region", "asc"],
        ]),
      ),
    ).toEqual({ code: "too_many_sorts", params: { max: 3 } });
    expect(
      validateQueryValues(
        DEF,
        sorted([
          ["number", "asc"],
          ["nope", "asc"],
        ]),
      ),
    ).toEqual({ code: "unknown_field", params: { field: "nope" } });
    expect(
      validateQueryValues(
        DEF,
        sorted([
          ["number", "asc"],
          ["number", "desc"],
        ]),
      ),
    ).toEqual({ code: "invalid_value", params: { field: "number" } });
  });

  test("the sort chip carries the further columns and clears them all", () => {
    const chip = listFilterChips(DEF, query).find(
      (item) => item.kind === "sort",
    );
    expect(chip).toMatchObject({
      field: "number",
      direction: "asc",
      then: [{ field: "total", direction: "desc" }],
      clear: { type: "setSort", field: "created_at", direction: "desc" },
    });
    const idle = listFilterChips(
      DEF,
      sorted([
        ["created_at", "desc"],
        ["total", "asc"],
      ]),
    ).find((item) => item.kind === "sort");
    expect(idle?.clear).not.toBeNull();
  });
});

describe("the in-memory source sorts by several columns", () => {
  const rows: GridRow[] = [
    { id: "a", number: 2, total: 100, name: "x" },
    { id: "b", number: 1, total: 300, name: "y" },
    { id: "c", number: 2, total: 300, name: "z" },
    { id: "d", number: 1, total: 100, name: "w" },
    { id: "e", number: 2, total: 300, name: "v" },
  ];
  const source = createMemorySource(TEST_DEF, rows);
  const signal = new AbortController().signal;
  const ids = async (query: QueryState) =>
    (await source.fetchPage(query, 10, signal)).rows.map((row) => row.id);

  test("each column keeps its own direction and the key breaks ties the first column's way", async () => {
    expect(
      await ids(
        sorted([
          ["number", "asc"],
          ["total", "desc"],
        ]),
      ),
    ).toEqual(["b", "d", "c", "e", "a"]);
    expect(
      await ids(
        sorted([
          ["number", "desc"],
          ["total", "desc"],
        ]),
      ),
    ).toEqual(["e", "c", "a", "b", "d"]);
    expect(
      await ids(
        sorted([
          ["total", "asc"],
          ["number", "desc"],
          ["name", "asc"],
        ]),
      ),
    ).toEqual(["a", "d", "e", "c", "b"]);
  });

  test("every field is a further sort column and none needs a narrowed set", () => {
    const { capabilities } = source;
    expect(capabilities.thenByFields).toContain("note");
    expect(
      capabilities.canRun(
        sorted([
          ["number", "asc"],
          ["note", "desc"],
        ]),
      ),
    ).toBe(true);
    expect(
      capabilities.isNarrowed(
        sorted([
          ["number", "asc"],
          ["note", "desc"],
        ]),
      ),
    ).toBe(false);
  });
});
