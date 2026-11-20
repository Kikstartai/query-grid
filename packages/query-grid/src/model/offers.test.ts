import { describe, expect, test } from "bun:test";

import type { QueryState } from "./query-state.ts";
import type { OfferContext } from "./capabilities.ts";
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
  indexCapabilities,
  indexId,
} from "./indexes.ts";
import type { IndexDef } from "./grid-def.ts";

const INDEXES = TEST_INDEXES;
const BASE = defaultQuery(TEST_DEF);
const CAPABILITIES = indexCapabilities(INDEXES, {
  facetField: "status",
  searchFields: TEST_SEARCH_FIELDS,
});
const CAPPED: OfferContext = {
  capabilities: CAPABILITIES,
  allSearchMatchesLoaded: false,
};
const COMPLETE: OfferContext = {
  capabilities: CAPABILITIES,
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
      thenBy: [],
      ranges: ["total"],
      narrowRanges: [],
      texts: [],
      narrowTexts: [],
      overlaps: [],
      combineOr: false,
      groups: [],
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

  test("a search keeps the equality filters and holds the sort and the ranges", () => {
    const search = applyAction(
      TEST_DEF,
      BASE,
      { type: "setSearch", value: "abc" },
      CAPPED,
    );
    expect(search.search).toBe("abc");
    expect(listOffers(TEST_DEF, search, CAPPED)).toEqual({
      equals: ["status", "region"],
      multi: ["status", "region"],
      exclude: ["status", "region"],
      sorts: [],
      thenBy: [],
      ranges: [],
      narrowRanges: [],
      texts: [],
      narrowTexts: [],
      overlaps: [],
      combineOr: false,
      groups: [],
      search: true,
    });
    expect(listOffers(TEST_DEF, search, COMPLETE).sorts).toEqual([
      "created_at",
      "total",
    ]);
    const narrowed = applyAction(
      TEST_DEF,
      search,
      { type: "setEquals", field: "status", values: ["open", "done"] },
      CAPPED,
    );
    expect(narrowed).toMatchObject({
      search: "abc",
      equals: { status: ["open", "done"] },
    });
    expect(
      applyAction(
        TEST_DEF,
        narrowed,
        { type: "setEquals", field: "region", values: ["north"] },
        CAPPED,
      ).equals,
    ).toEqual({ status: ["open", "done"], region: ["north"] });
  });

  test("a search is offered beside an equality filter and not beside a range", () => {
    const filtered: QueryState = {
      ...BASE,
      equals: { status: ["open"] },
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
      equals: { status: ["open"] },
      sort: TEST_DEF.defaultSort,
    });
    const ranged: QueryState = {
      ...BASE,
      ranges: [{ field: "created_at", min: "2026-01-01", max: null }],
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

  test("an index that opts out offers one value only", () => {
    const single: IndexDef[] = INDEXES.map((index) =>
      index.equals.includes("region") ? { ...index, multi: false } : index,
    );
    const context: OfferContext = {
      capabilities: indexCapabilities(single),
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
