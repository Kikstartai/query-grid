import { describe, expect, test } from "bun:test";

import type { QueryRules, QueryState } from "./field-types.ts";
import {
  TEST_DEF,
  TEST_QUICK_FIELDS,
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
  type IndexDef,
} from "./indexes.ts";

const INDEXES = TEST_INDEXES;
const BASE = defaultQuery(TEST_DEF);
const CAPS = indexCapabilities(INDEXES, {
  facetField: "status",
  quickFields: TEST_QUICK_FIELDS,
});
const CAPPED: QueryRules = { capabilities: CAPS, quickComplete: false };
const COMPLETE: QueryRules = { capabilities: CAPS, quickComplete: true };

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
      sorts: ["created_at", "total"],
      ranges: ["total"],
      quick: true,
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
      range: { field: "total", min: "100", max: null },
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

  test("a quick filter disables everything until every match is loaded", () => {
    const quick = applyAction(
      TEST_DEF,
      BASE,
      { type: "setQuick", value: "abc" },
      CAPPED,
    );
    expect(quick.quick).toBe("abc");
    expect(listOffers(TEST_DEF, quick, CAPPED)).toEqual({
      equals: [],
      multi: [],
      sorts: [],
      ranges: [],
      quick: true,
    });
    expect(listOffers(TEST_DEF, quick, COMPLETE).sorts).toEqual([
      "created_at",
      "total",
    ]);
    expect(listOffers(TEST_DEF, quick, COMPLETE).equals).toEqual([]);
  });

  test("a quick filter is not offered beside another filter", () => {
    const filtered: QueryState = { ...BASE, equals: { status: ["open"] } };
    expect(listOffers(TEST_DEF, filtered, CAPPED).quick).toBe(false);
    expect(
      applyAction(
        TEST_DEF,
        filtered,
        { type: "setQuick", value: "abc" },
        CAPPED,
      ),
    ).toBe(filtered);
  });

  test("an index that opts out offers one value only", () => {
    const single: IndexDef[] = INDEXES.map((index) =>
      "equals" in index && index.equals.includes("region")
        ? { ...index, multi: false }
        : index,
    );
    const rules: QueryRules = {
      capabilities: indexCapabilities(single),
      quickComplete: false,
    };
    const offers = listOffers(TEST_DEF, BASE, rules);
    expect(offers.equals).toEqual(["status", "region"]);
    expect(offers.multi).toEqual(["status"]);
    const one: QueryState = { ...BASE, equals: { region: ["north"] } };
    expect(
      applyAction(
        TEST_DEF,
        one,
        { type: "setEquals", field: "region", values: ["north", "south"] },
        rules,
      ),
    ).toBe(one);
  });
});

describe("reachable states", () => {
  test("every reachable control state is a declared index and every index is reached", () => {
    for (const rules of [CAPPED, COMPLETE]) {
      const reached = new Set<string>();
      const states = enumerateReachableStates(TEST_DEF, rules);
      for (const state of states) {
        expect(isQueryIndexed(INDEXES, TEST_QUICK_FIELDS, state)).toBe(true);
        if (state.quick === null) {
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
