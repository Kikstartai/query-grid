import { describe, expect, test } from "bun:test";

import type { FilterOp } from "./operators.ts";
import type { QueryState } from "./query-state.ts";
import type { DataSourceCapabilities, OfferContext } from "./capabilities.ts";
import {
  createTestSource,
  TEST_DEF,
  TEST_INDEXES,
  UNTIERED,
} from "./grid-def.fixture.ts";
import {
  applyAction,
  defaultQuery,
  enumerateReachableStates,
  listOffers,
  type Offers,
} from "./query-actions.ts";
import {
  isQueryIndexed,
  getIndex,
  gridDefCapabilities,
  indexId,
} from "./indexes.ts";
import type { IndexedGridDef } from "./grid-def.ts";
import { withLiteralFilters } from "./literal-filters.ts";

const INDEXES = TEST_INDEXES;
const DEF: IndexedGridDef = { ...TEST_DEF, indexes: INDEXES };
const BASE = defaultQuery(TEST_DEF);
const RANGE_OPS: FilterOp[] = [
  "equals",
  "greater_than",
  "greater_or_equal",
  "less_than",
  "less_or_equal",
  "between",
];
const CAPABILITIES: DataSourceCapabilities = {
  ...gridDefCapabilities(DEF),
  ...UNTIERED,
  filterOps: {
    created_at: RANGE_OPS,
    total: RANGE_OPS,
    status: ["any_of"],
    region: ["any_of"],
  },
  canRun: (query) => query.group === null && isQueryIndexed(DEF, query),
};
const CAPPED: OfferContext = {
  capabilities: CAPABILITIES,
  allSearchMatchesLoaded: false,
};
const COMPLETE: OfferContext = {
  capabilities: CAPABILITIES,
  allSearchMatchesLoaded: true,
};
function listOffered(offers: Offers): Record<string, FilterOp[]> {
  return Object.fromEntries(
    Object.entries(offers.filters)
      .map(
        ([key, ops]) =>
          [key, ops.filter((op) => op.offered).map((op) => op.op)] as const,
      )
      .filter(([, ops]) => ops.length > 0),
  );
}

describe("offers from declared indexes", () => {
  test("a sort narrows the filters an index answers", () => {
    const byTotal = applyAction(
      TEST_DEF,
      BASE,
      { type: "setSort", field: "total", direction: "desc" },
      CAPPED,
    );
    const offers = listOffers(TEST_DEF, byTotal, CAPPED);
    expect(listOffered(offers)).toEqual({
      status: ["any_of"],
      total: RANGE_OPS,
    });
    expect(offers).toEqual({
      filters: expect.any(Object),
      sorts: ["created_at", "total"],
      thenBy: [],
      combineOr: false,
      groups: [],
      search: true,
    });
    expect(offers.filters.region).toEqual([
      {
        op: "any_of",
        offered: false,
        reason: expect.objectContaining({ code: "no_filter_with" }),
      },
    ]);
    expect(
      offers.filters.created_at.find((op) => op.op === "between")?.reason?.code,
    ).toBe("range_needs_sort");
    expect(listOffered(listOffers(TEST_DEF, BASE, CAPPED))).toEqual({
      created_at: RANGE_OPS,
      status: ["any_of"],
      region: ["any_of"],
    });
  });

  test("an excluded value is offered wherever its expansion is", () => {
    const capabilities = withLiteralFilters(
      TEST_DEF,
      createTestSource(CAPABILITIES),
    ).capabilities;
    const context: OfferContext = {
      capabilities,
      allSearchMatchesLoaded: false,
    };
    const byTotal: QueryState = {
      ...BASE,
      sort: { field: "total", direction: "desc" },
    };
    const offered = listOffered(listOffers(TEST_DEF, byTotal, context));
    expect(offered.status).toEqual(["any_of", "none_of"]);
    expect(offered.region).toBeUndefined();
  });

  test("an action with no index leaves the query alone", () => {
    const byTotal: QueryState = {
      ...BASE,
      sort: { field: "total", direction: "desc" },
    };
    expect(
      applyAction(
        TEST_DEF,
        byTotal,
        {
          type: "setFilter",
          filter: { field: "region", op: "any_of", values: ["north"] },
        },
        CAPPED,
      ),
    ).toBe(byTotal);
  });

  test("clearing a filter falls back to a declared index", () => {
    const filtered: QueryState = {
      ...BASE,
      filters: [
        { field: "status", op: "any_of", values: ["open"] },
        { field: "total", op: "greater_or_equal", value: "100" },
      ],
      sort: { field: "total", direction: "asc" },
    };
    const cleared = applyAction(
      TEST_DEF,
      filtered,
      { type: "removeFilter", field: "status" },
      CAPPED,
    );
    expect(cleared.filters.some((filter) => filter.field === "status")).toBe(
      false,
    );
    expect(getIndex(DEF, cleared)).not.toBeNull();
  });

  test("a search keeps the equality filters and holds the sort and the ranges", () => {
    const search = applyAction(
      TEST_DEF,
      BASE,
      { type: "setSearch", value: "abc" },
      CAPPED,
    );
    expect(search.search).toBe("abc");
    const offers = listOffers(TEST_DEF, search, CAPPED);
    expect(listOffered(offers)).toEqual({
      status: ["any_of"],
      region: ["any_of"],
    });
    expect(offers).toEqual({
      filters: expect.any(Object),
      sorts: [],
      thenBy: [],
      combineOr: false,
      groups: [],
      search: true,
    });
    expect(
      offers.filters.total.every(
        (op) => op.reason?.code === "search_no_combine",
      ),
    ).toBe(true);
    expect(listOffers(TEST_DEF, search, COMPLETE).sorts).toEqual([
      "created_at",
      "total",
    ]);
    const narrowed = applyAction(
      TEST_DEF,
      search,
      {
        type: "setFilter",
        filter: { field: "status", op: "any_of", values: ["open", "done"] },
      },
      CAPPED,
    );
    expect(narrowed).toMatchObject({
      search: "abc",
      filters: [{ field: "status", op: "any_of", values: ["open", "done"] }],
    });
    expect(
      applyAction(
        TEST_DEF,
        narrowed,
        {
          type: "setFilter",
          filter: { field: "region", op: "any_of", values: ["north"] },
        },
        CAPPED,
      ).filters,
    ).toEqual([
      { field: "status", op: "any_of", values: ["open", "done"] },
      { field: "region", op: "any_of", values: ["north"] },
    ]);
  });

  test("a search is offered beside an equality filter and not beside a range", () => {
    const filtered: QueryState = {
      ...BASE,
      filters: [{ field: "status", op: "any_of", values: ["open"] }],
      sort: { field: "total", direction: "asc" },
    };
    expect(listOffers(TEST_DEF, filtered, CAPPED).search).toBe(true);
    expect(
      applyAction(
        TEST_DEF,
        filtered,
        { type: "setSearch", value: "abc" },
        CAPPED,
      ),
    ).toMatchObject({
      search: "abc",
      filters: [{ field: "status", op: "any_of", values: ["open"] }],
      sort: TEST_DEF.defaultSort,
    });
    const ranged: QueryState = {
      ...BASE,
      filters: [
        { field: "created_at", op: "greater_or_equal", value: "2026-01-01" },
      ],
    };
    expect(listOffers(TEST_DEF, ranged, CAPPED).search).toBe(false);
    expect(
      applyAction(
        TEST_DEF,
        ranged,
        { type: "setSearch", value: "abc" },
        CAPPED,
      ),
    ).toBe(ranged);
  });

  test("any of always takes several values", () => {
    const one: QueryState = {
      ...BASE,
      filters: [{ field: "region", op: "any_of", values: ["north"] }],
    };
    expect(
      applyAction(
        TEST_DEF,
        one,
        {
          type: "setFilter",
          filter: { field: "region", op: "any_of", values: ["north", "south"] },
        },
        CAPPED,
      ).filters,
    ).toEqual([{ field: "region", op: "any_of", values: ["north", "south"] }]);
  });
});

describe("reachable states", () => {
  test("every reachable control state is a declared index and every index is reached", () => {
    for (const context of [CAPPED, COMPLETE]) {
      const reached = new Set<string>();
      const states = enumerateReachableStates(TEST_DEF, context);
      for (const state of states) {
        expect(isQueryIndexed(DEF, state)).toBe(true);
        if (state.search === null) {
          reached.add(indexId(getIndex(DEF, state)!));
        }
      }
      expect([...reached].sort()).toEqual(INDEXES.map(indexId).sort());
    }
  });
});
