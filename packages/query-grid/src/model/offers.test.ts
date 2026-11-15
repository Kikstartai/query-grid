import { describe, expect, test } from "bun:test";

import type { OfferContext, QueryState } from "./field-types.ts";
import {
  TEST_DEF,
  TEST_SEARCH_FIELDS,
  TEST_INDEXES,
} from "./grid-def.fixture.ts";
import {
  applyAction,
  defaultQuery,
  enumerateReachableStates,
  listOffers,
} from "./query-actions.ts";
import {
  isQueryIndexed,
  getIndex,
  indexRunnable,
  indexId,
  type IndexDef,
} from "./indexes.ts";

const INDEXES = TEST_INDEXES;
const BASE = defaultQuery(TEST_DEF);
const RUNNABLE = indexRunnable(INDEXES, {
  facetField: "status",
  searchFields: TEST_SEARCH_FIELDS,
});
const CAPPED: OfferContext = {
  runnable: RUNNABLE,
  allSearchMatchesLoaded: false,
};
const COMPLETE: OfferContext = {
  runnable: RUNNABLE,
  allSearchMatchesLoaded: true,
};

describe("offers from declared indexes", () => {
  test("a sort narrows the filters an index answers", () => {
    const byTotal = applyAction(
      TEST_DEF,
      BASE,
      { type: "setSort", field: "total", direction: "desc" },
      CAPPED,
    );
    expect(listOffers(TEST_DEF, byTotal, CAPPED)).toEqual({
      equals: ["status"],
      multi: ["status"],
      exclude: ["status"],
      sorts: ["created_at", "total"],
      ranges: ["total"],
      search: true,
    });
    expect(listOffers(TEST_DEF, BASE, CAPPED).equals).toEqual([
      "status",
      "region",
    ]);
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
        { type: "setEquals", field: "region", values: ["north"] },
        CAPPED,
      ),
    ).toBe(byTotal);
  });

  test("clearing a filter falls back to a declared index", () => {
    const filtered: QueryState = {
      ...BASE,
      equals: { status: ["open"] },
      sort: { field: "total", direction: "asc" },
      ranges: [{ field: "total", min: "100", max: null }],
    };
    const cleared = applyAction(
      TEST_DEF,
      filtered,
      { type: "clearEquals", field: "status" },
      CAPPED,
    );
    expect(cleared.equals).toEqual({});
    expect(getIndex(INDEXES, cleared)).not.toBeNull();
  });

  test("a search disables everything until every match is loaded", () => {
    const search = applyAction(
      TEST_DEF,
      BASE,
      { type: "setSearch", value: "abc" },
      CAPPED,
    );
    expect(search.search).toBe("abc");
    expect(listOffers(TEST_DEF, search, CAPPED)).toEqual({
      equals: [],
      multi: [],
      exclude: [],
      sorts: [],
      ranges: [],
      search: true,
    });
    expect(listOffers(TEST_DEF, search, COMPLETE).sorts).toEqual([
      "created_at",
      "total",
    ]);
    expect(listOffers(TEST_DEF, search, COMPLETE).equals).toEqual([]);
  });

  test("a search is not offered beside another filter", () => {
    const filtered: QueryState = { ...BASE, equals: { status: ["open"] } };
    expect(listOffers(TEST_DEF, filtered, CAPPED).search).toBe(false);
    expect(
      applyAction(
        TEST_DEF,
        filtered,
        { type: "setSearch", value: "abc" },
        CAPPED,
      ),
    ).toBe(filtered);
  });

  test("an index that opts out offers one value only", () => {
    const single: IndexDef[] = INDEXES.map((index) =>
      index.equals.includes("region") ? { ...index, multi: false } : index,
    );
    const context: OfferContext = {
      runnable: indexRunnable(single),
      allSearchMatchesLoaded: false,
    };
    const offers = listOffers(TEST_DEF, BASE, context);
    expect(offers.equals).toEqual(["status", "region"]);
    expect(offers.multi).toEqual(["status"]);
    const one: QueryState = { ...BASE, equals: { region: ["north"] } };
    expect(
      applyAction(
        TEST_DEF,
        one,
        { type: "setEquals", field: "region", values: ["north", "south"] },
        context,
      ),
    ).toBe(one);
  });
});

describe("reachable states", () => {
  test("every reachable control state is a declared index and every index is reached", () => {
    for (const context of [CAPPED, COMPLETE]) {
      const reached = new Set<string>();
      const states = enumerateReachableStates(TEST_DEF, context);
      for (const state of states) {
        expect(isQueryIndexed(INDEXES, TEST_SEARCH_FIELDS, state)).toBe(true);
        if (state.search === null) {
          reached.add(indexId(getIndex(INDEXES, state)!));
        }
      }
      expect([...reached].sort()).toEqual(INDEXES.map(indexId).sort());
      expect(
        states.some((state) => (state.equals.status?.length ?? 0) > 1),
      ).toBe(true);
    }
  });
});
