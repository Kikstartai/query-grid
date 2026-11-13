import { describe, expect, test } from "bun:test";

import type { GridDef, QueryRules, QueryState } from "./field-types.ts";
import { listFilterChips } from "./format.ts";
import {
  applyAction,
  defaultQuery,
  enumerateReachableStates,
  explainUnavailable,
  listOffers,
} from "./query-actions.ts";
import { createQueryStore } from "./query-store.ts";
import { decodeQuery, encodeQuery } from "./query-url.ts";
import { validateQueryValues } from "./query-validate.ts";
import {
  isAnswerable,
  matchShape,
  shapeId,
  validateGridDef,
} from "./shapes.ts";
import { TEST_DEF } from "./grid-def.fixture.ts";

const BASE = defaultQuery(TEST_DEF);
const COMPLETE: QueryRules = { mode: "indexed", quickComplete: true };
const MEMORY: QueryRules = { mode: "memory", quickComplete: false };

describe("validateGridDef", () => {
  test("the test def is valid", () => {
    expect(validateGridDef(TEST_DEF)).toEqual([]);
  });

  test("bad shapes are named", () => {
    const broken: GridDef = {
      ...TEST_DEF,
      total: { field: "name" },
      shapes: [
        { equals: [], sort: "note" },
        { equals: ["total"], sort: "created_at" },
        { equals: [], sort: "created_at" },
        { equals: [], sort: "created_at" },
        { quick: ["created_at", "missing"] },
      ],
    };
    const problems = validateGridDef(broken).join("\n");
    expect(problems).toContain("a nullable field cannot be a keyset sort");
    expect(problems).toContain("total does not offer eq");
    expect(problems).toContain("is declared twice");
    expect(problems).toContain("created_at is a datetime");
    expect(problems).toContain("unknown field missing");
    expect(problems).toContain("total: name is not a non-null money");
  });

  test("the default sort must be a shape", () => {
    expect(
      validateGridDef({ ...TEST_DEF, shapes: [{ equals: [], sort: "total" }] }),
    ).toContain("the default sort with no filter is not a declared shape");
  });
});

describe("matchShape", () => {
  test("the equality set must match exactly", () => {
    expect(matchShape(TEST_DEF, BASE)).toEqual(TEST_DEF.shapes[0]);
    expect(
      matchShape(TEST_DEF, {
        ...BASE,
        equals: { status: "open", region: "north" },
      }),
    ).toBeNull();
  });

  test("a range sits on the sort column of a shape that allows it", () => {
    const range = { field: "created_at", min: "2026-01-01", max: null };
    expect(matchShape(TEST_DEF, { ...BASE, range })).not.toBeNull();
    expect(
      matchShape(TEST_DEF, { ...BASE, equals: { status: "open" }, range }),
    ).toBeNull();
    expect(
      matchShape(TEST_DEF, {
        ...BASE,
        sort: { field: "total", direction: "asc" },
        range,
      }),
    ).toBeNull();
  });

  test("a quick filter combines with no other filter", () => {
    expect(matchShape(TEST_DEF, { ...BASE, quick: "abc" })).toEqual({
      quick: ["name", "number"],
    });
    expect(
      matchShape(TEST_DEF, { ...BASE, quick: "abc", equals: { status: "open" } }),
    ).toBeNull();
  });
});

describe("offers", () => {
  test("a sort narrows the filters an index answers", () => {
    const byTotal = applyAction(TEST_DEF, BASE, {
      type: "setSort",
      field: "total",
      direction: "desc",
    });
    expect(listOffers(TEST_DEF, byTotal)).toEqual({
      equals: ["status"],
      sorts: ["created_at", "total"],
      ranges: ["total"],
      quick: true,
    });
    expect(listOffers(TEST_DEF, BASE).equals).toEqual(["status", "region"]);
  });

  test("an action with no shape leaves the query alone", () => {
    const byTotal = { ...BASE, sort: { field: "total", direction: "desc" as const } };
    expect(
      applyAction(TEST_DEF, byTotal, {
        type: "setEquals",
        field: "region",
        value: "north",
      }),
    ).toBe(byTotal);
  });

  test("clearing a filter falls back to a declared shape", () => {
    const filtered: QueryState = {
      ...BASE,
      equals: { status: "open" },
      sort: { field: "total", direction: "asc" },
      range: { field: "total", min: "100", max: null },
    };
    const cleared = applyAction(TEST_DEF, filtered, {
      type: "clearEquals",
      field: "status",
    });
    expect(cleared.equals).toEqual({});
    expect(matchShape(TEST_DEF, cleared)).not.toBeNull();
  });

  test("a quick filter disables everything until every match is loaded", () => {
    const quick = applyAction(TEST_DEF, BASE, { type: "setQuick", value: "abc" });
    expect(quick.quick).toBe("abc");
    expect(listOffers(TEST_DEF, quick)).toEqual({
      equals: [],
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
    const filtered = { ...BASE, equals: { status: "open" } };
    expect(listOffers(TEST_DEF, filtered).quick).toBe(false);
    expect(
      applyAction(TEST_DEF, filtered, { type: "setQuick", value: "abc" }),
    ).toBe(filtered);
  });

  test("setting the quick filter returns to the default sort", () => {
    const byTotal = { ...BASE, sort: { field: "total", direction: "asc" as const } };
    const quick = applyAction(TEST_DEF, byTotal, {
      type: "setQuick",
      value: "abc",
    });
    expect(quick.sort).toEqual(TEST_DEF.defaultSort);
  });

  test("every reachable control state is a declared shape and every shape is reached", () => {
    for (const rules of [undefined, COMPLETE]) {
      const reached = new Set<string>();
      for (const state of enumerateReachableStates(TEST_DEF, rules)) {
        const shape = matchShape(TEST_DEF, state);
        expect(shape).not.toBeNull();
        reached.add(shapeId(shape!));
      }
      expect([...reached].sort()).toEqual(TEST_DEF.shapes.map(shapeId).sort());
    }
  });

  test("the reason names what blocks a control", () => {
    const byTotal = { ...BASE, sort: { field: "total", direction: "desc" as const } };
    expect(
      explainUnavailable(TEST_DEF, byTotal, { kind: "equals", field: "region" }),
    ).toBe("No index answers Region with sort Total.");
    expect(
      explainUnavailable(TEST_DEF, byTotal, {
        kind: "range",
        field: "created_at",
      }),
    ).toBe("No index answers a Created range unless the sort is Created.");
    expect(
      explainUnavailable(
        TEST_DEF,
        { ...BASE, equals: { region: "north" } },
        { kind: "sort", field: "total" },
      ),
    ).toBe("No index sorts by Total with the Region filter and sort Created.");
  });
});

describe("memory mode", () => {
  test("every declared filter and sort is offered, in any combination", () => {
    const busy: QueryState = {
      ...BASE,
      equals: { status: "open", region: "north" },
      range: { field: "total", min: "1", max: null },
      quick: "abc",
      sort: { field: "name", direction: "asc" },
    };
    expect(isAnswerable(TEST_DEF, busy, "memory")).toBe(true);
    expect(isAnswerable(TEST_DEF, busy, "indexed")).toBe(false);
    const offers = listOffers(TEST_DEF, busy, MEMORY);
    expect(offers.equals).toEqual(["status", "region"]);
    expect(offers.ranges).toEqual(["created_at", "total"]);
    expect(offers.sorts).toEqual(TEST_DEF.fields.map((field) => field.key));
    expect(offers.quick).toBe(true);
  });

  test("the store applies its mode", () => {
    const store = createQueryStore(TEST_DEF, BASE, "grid", "memory");
    store.dispatch({ type: "setSort", field: "name", direction: "asc" });
    store.dispatch({ type: "setEquals", field: "region", value: "north" });
    store.dispatch({ type: "setRange", field: "total", min: "5", max: "9" });
    expect(store.getQuery()).toMatchObject({
      equals: { region: "north" },
      range: { field: "total", min: "5", max: "9" },
      sort: { field: "name", direction: "asc" },
    });
  });
});

describe("the URL", () => {
  test("a query round-trips", () => {
    const query: QueryState = {
      equals: { status: "open" },
      range: { field: "total", min: "100", max: null },
      quick: null,
      sort: { field: "total", direction: "asc" },
      cursor: "abc",
    };
    const params = encodeQuery(TEST_DEF, query);
    expect(params.toString()).toBe(
      "f.status=open&r.total=100..&sort=total.asc&cursor=abc",
    );
    expect(decodeQuery(TEST_DEF, params)).toEqual(query);
  });

  test("the quick filter and the default sort", () => {
    const query = { ...BASE, quick: "smi th" };
    const params = encodeQuery(TEST_DEF, query);
    expect(params.toString()).toBe("q=smi+th");
    expect(decodeQuery(TEST_DEF, params)).toEqual(query);
  });
});

describe("values", () => {
  test("a value outside its type is named", () => {
    expect(
      validateQueryValues(TEST_DEF, { ...BASE, equals: { status: "nope" } }),
    ).toBe("invalid value for status");
    expect(validateQueryValues(TEST_DEF, { ...BASE, quick: "ab" })).toContain(
      "3 to 80 characters",
    );
    expect(validateQueryValues(TEST_DEF, BASE)).toBeNull();
  });
});

describe("chips", () => {
  test("every active filter and the sort get a chip", () => {
    const query: QueryState = {
      ...BASE,
      equals: { status: "open" },
      sort: { field: "total", direction: "asc" },
      range: { field: "total", min: "1000", max: null },
    };
    const chips = listFilterChips(TEST_DEF, query);
    expect(chips.map((chip) => chip.label)).toEqual([
      "Status: Open",
      "Total: $10.00 – …",
      "Sort: Total ↑",
    ]);
    expect(chips[2].clear).toEqual({
      type: "setSort",
      field: "created_at",
      direction: "desc",
    });
    const idle = listFilterChips(TEST_DEF, BASE);
    expect(idle).toHaveLength(1);
    expect(idle[0].clear).toBeNull();
  });
});

describe("the sort under an unordered quick filter", () => {
  test("only a return to the default sort is accepted", () => {
    const stuck: QueryState = {
      ...BASE,
      quick: "abc",
      sort: { field: "total", direction: "desc" },
    };
    expect(
      applyAction(TEST_DEF, stuck, {
        type: "setSort",
        field: "total",
        direction: "asc",
      }),
    ).toBe(stuck);
    expect(
      applyAction(TEST_DEF, stuck, { type: "setSort", ...TEST_DEF.defaultSort })
        .sort,
    ).toEqual(TEST_DEF.defaultSort);
    expect(listOffers(TEST_DEF, stuck).sorts).toEqual([]);
  });
});
