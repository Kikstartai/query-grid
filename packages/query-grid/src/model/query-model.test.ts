import { describe, expect, test } from "bun:test";

import { listFilterChips } from "./chips.ts";
import type { QueryState } from "./query-state.ts";
import {
  listFilterFields,
  resolveFilterKind,
  type DataSourceCapabilities,
  type OfferContext,
} from "./capabilities.ts";
import { TEST_DEF, TEST_SEARCH_FIELDS, UNTIERED } from "./grid-def.fixture.ts";
import { memoryCapabilities } from "./memory-source.ts";
import {
  applyAction,
  defaultQuery,
  enumerateReachableStates,
  explainUnavailable,
  listOffers,
} from "./query-actions.ts";
import { createQueryStore } from "./query-store.ts";
import { decodeQuery, encodeQuery, listQueryKeys } from "./query-url.ts";
import { validateQueryValues } from "./query-validate.ts";

const BASE = defaultQuery(TEST_DEF);

const SERVER: DataSourceCapabilities = {
  ...UNTIERED,
  holdsAllRows: false,
  searchIsOrdered: false,
  facetCountsFollowFilters: false,
  canRun: (query) =>
    Object.keys(query.equals).every((key) => key === "status") &&
    (query.equals.status?.length ?? 1) === 1,
  equalsFields: ["status", "region"],
  rangeFields: ["created_at", "total"],
  sortFields: ["created_at", "total"],
  searchFields: TEST_SEARCH_FIELDS,
  isFacetCountExact: () => true,
};
const CAPPED: OfferContext = {
  capabilities: SERVER,
  allSearchMatchesLoaded: false,
};
const COMPLETE: OfferContext = {
  capabilities: SERVER,
  allSearchMatchesLoaded: true,
};
const MEMORY: OfferContext = {
  capabilities: memoryCapabilities(TEST_DEF),
  allSearchMatchesLoaded: false,
};

describe("filter kinds", () => {
  const kindsOf = (capabilities: DataSourceCapabilities) =>
    Object.fromEntries(
      listFilterFields(TEST_DEF, capabilities).map((field) => [
        field.key,
        resolveFilterKind(field, capabilities),
      ]),
    );

  test("on a server grid the allowed filters are the ones the capabilities name", () => {
    expect(kindsOf(SERVER)).toEqual({
      created_at: "range",
      total: "range",
      status: "equals",
      region: "equals",
    });
    expect(
      kindsOf({ ...SERVER, equalsFields: ["name"], rangeFields: [] }),
    ).toEqual({ name: "lookup" });
  });

  test("a list of keys picks the filters and their order, skipping a field with none", () => {
    expect(
      listFilterFields(TEST_DEF, SERVER, ["region", "note", "status"]).map(
        (field) => field.key,
      ),
    ).toEqual(["region", "status"]);
  });

  test("on a client grid every field is filterable, by its type and options", () => {
    expect(kindsOf(memoryCapabilities(TEST_DEF))).toEqual({
      id: "lookup",
      number: "range",
      created_at: "range",
      total: "range",
      status: "equals",
      region: "equals",
      name: "lookup",
      note: "lookup",
    });
  });
});

describe("actions", () => {
  test("an action the capabilities refuse leaves the query alone", () => {
    expect(
      applyAction(
        TEST_DEF,
        BASE,
        { type: "setEquals", field: "region", values: ["north"] },
        CAPPED,
      ),
    ).toBe(BASE);
  });

  test("equality takes several values, without duplicates", () => {
    const set = applyAction(
      TEST_DEF,
      BASE,
      { type: "setEquals", field: "status", values: ["open", "done", "open"] },
      MEMORY,
    );
    expect(set.equals).toEqual({ status: ["open", "done"] });
    const one = applyAction(
      TEST_DEF,
      set,
      { type: "removeEqualsValue", field: "status", value: "open" },
      MEMORY,
    );
    expect(one.equals).toEqual({ status: ["done"] });
    const none = applyAction(
      TEST_DEF,
      one,
      { type: "removeEqualsValue", field: "status", value: "done" },
      MEMORY,
    );
    expect(none.equals).toEqual({});
  });

  test("a value list past the field's cap is not applied", () => {
    const capped = {
      ...TEST_DEF,
      fields: TEST_DEF.fields.map((field) =>
        field.key === "status" ? { ...field, maxValues: 1 } : field,
      ),
    };
    const context: OfferContext = {
      capabilities: memoryCapabilities(capped),
      allSearchMatchesLoaded: false,
    };
    expect(
      applyAction(
        capped,
        BASE,
        { type: "setEquals", field: "status", values: ["open", "done"] },
        context,
      ),
    ).toBe(BASE);
    expect(listOffers(capped, BASE, context).multi).toEqual([
      "id",
      "region",
      "name",
      "note",
    ]);
  });

  test("an empty value list clears the field", () => {
    const set: QueryState = { ...BASE, equals: { status: ["open"] } };
    expect(
      applyAction(
        TEST_DEF,
        set,
        { type: "setEquals", field: "status", values: [] },
        MEMORY,
      ).equals,
    ).toEqual({});
  });

  test("several values are offered only where the capabilities answer them", () => {
    expect(listOffers(TEST_DEF, BASE, CAPPED)).toMatchObject({
      equals: ["status"],
      multi: [],
    });
    expect(listOffers(TEST_DEF, BASE, MEMORY)).toMatchObject({
      equals: ["id", "status", "region", "name", "note"],
      multi: ["id", "status", "region", "name", "note"],
    });
  });

  test("setting the search returns to the default sort on a server", () => {
    const byTotal: QueryState = {
      ...BASE,
      sort: { field: "total", direction: "asc" },
    };
    const action = { type: "setSearch", value: "abc" } as const;
    expect(applyAction(TEST_DEF, byTotal, action, CAPPED).sort).toEqual(
      TEST_DEF.defaultSort,
    );
    expect(applyAction(TEST_DEF, byTotal, action, MEMORY).sort).toEqual(
      byTotal.sort,
    );
  });
});

describe("the reason a control is unavailable", () => {
  const byTotal: QueryState = {
    ...BASE,
    equals: { status: ["open"] },
    sort: { field: "total", direction: "desc" },
  };

  test("it is a code with the fields that block it, never a sentence", () => {
    expect(
      explainUnavailable(byTotal, { kind: "equals", field: "region" }, CAPPED),
    ).toEqual({
      code: "no_filter_with",
      field: "region",
      filters: ["status"],
      ranges: [],
      sort: "total",
      rows: null,
      capped: false,
      narrowBy: [],
    });
    expect(
      explainUnavailable(
        byTotal,
        { kind: "range", field: "created_at" },
        CAPPED,
      ).code,
    ).toBe("range_needs_sort");
    expect(
      explainUnavailable(byTotal, { kind: "sort", field: "name" }, CAPPED),
    ).toEqual({
      code: "no_sort_with",
      field: "name",
      filters: ["status"],
      ranges: [],
      sort: "total",
      rows: null,
      capped: false,
      narrowBy: [],
    });
    expect(explainUnavailable(byTotal, { kind: "search" }, CAPPED).code).toBe(
      "search_alone",
    );
  });

  test("a search names why the sort is held", () => {
    const search: QueryState = { ...BASE, search: "abc" };
    const target = { kind: "sort", field: "total" } as const;
    expect(explainUnavailable(search, target, CAPPED).code).toBe(
      "search_unordered",
    );
    expect(explainUnavailable(search, target, COMPLETE).code).toBe(
      "no_sort_index",
    );
    expect(
      explainUnavailable(search, { kind: "range", field: "total" }, CAPPED),
    ).toMatchObject({ code: "search_no_combine", field: "total" });
  });
});

describe("the memory source", () => {
  test("every field is a filter and a sort, in any combination", () => {
    const busy: QueryState = {
      ...BASE,
      equals: { status: ["open", "done"], region: ["north"] },
      ranges: [{ field: "total", min: "1", max: null }],
      search: "abc",
      sort: { field: "name", direction: "asc" },
    };
    expect(MEMORY.capabilities.canRun(busy)).toBe(true);
    const offers = listOffers(TEST_DEF, busy, MEMORY);
    expect(offers.equals).toEqual(["id", "status", "region", "name", "note"]);
    expect(offers.ranges).toEqual(["number", "created_at", "total"]);
    expect(offers.sorts).toEqual(TEST_DEF.fields.map((field) => field.key));
    expect(offers.search).toBe(true);
  });

  test("no search fields means no search", () => {
    const bare = memoryCapabilities({ ...TEST_DEF, search: undefined });
    expect(bare.canRun({ ...BASE, search: "abc" })).toBe(false);
    expect(bare.searchFields).toEqual([]);
  });

  test("every reachable state is answerable, with several values included", () => {
    const keys = ["id", "status", "region", "total", "created_at"];
    const small = {
      ...TEST_DEF,
      search: [],
      fields: TEST_DEF.fields.filter((field) => keys.includes(field.key)),
    };
    const context = { ...MEMORY, capabilities: memoryCapabilities(small) };
    const states = enumerateReachableStates(small, context);
    expect(states.every(context.capabilities.canRun)).toBe(true);
    expect(states.some((state) => state.ranges.length > 1)).toBe(true);
    expect(states.some((state) => (state.equals.status?.length ?? 0) > 1)).toBe(
      true,
    );
  });

  test("the store applies its capabilities", () => {
    const store = createQueryStore(TEST_DEF, MEMORY.capabilities, BASE);
    store.dispatch({ type: "setSort", field: "name", direction: "asc" });
    store.dispatch({ type: "setEquals", field: "region", values: ["north"] });
    store.dispatch({ type: "setRange", field: "total", min: "5", max: "9" });
    expect(store.getQuery()).toMatchObject({
      equals: { region: ["north"] },
      ranges: [{ field: "total", min: "5", max: "9" }],
      sort: { field: "name", direction: "asc" },
    });
  });
});

describe("the store and browser history", () => {
  test("a filter, sort or view change asks for a new history entry", () => {
    const store = createQueryStore(TEST_DEF, MEMORY.capabilities, BASE);
    expect(store.getHistoryWrite()).toBe("replace");
    store.dispatch({ type: "setEquals", field: "status", values: ["open"] });
    expect(store.getHistoryWrite()).toBe("push");
    store.dispatch({ type: "setSearch", value: "abc" });
    expect(store.getHistoryWrite()).toBe("replace");
    store.setView("list");
    expect(store.getHistoryWrite()).toBe("push");
    store.dispatch({ type: "clearSearch" });
    expect(store.getHistoryWrite()).toBe("replace");
    store.dispatch({ type: "reset" });
    expect(store.getHistoryWrite()).toBe("push");
  });

  test("replace loads a query and a view from the URL without a new entry", () => {
    const store = createQueryStore(TEST_DEF, MEMORY.capabilities, BASE);
    let emitted = 0;
    store.subscribe(() => {
      emitted += 1;
    });
    store.setView("board");
    const next: QueryState = { ...BASE, equals: { region: ["north"] } };
    store.replace(next, "list");
    expect(store.getQuery()).toEqual(next);
    expect(store.getView()).toBe("list");
    expect(store.getHistoryWrite()).toBe("replace");
    store.replace(BASE);
    expect(store.getView()).toBe("list");
    expect(emitted).toBe(3);
  });

  test("replace keeps what did not change, so nothing refetches for it", () => {
    const store = createQueryStore(TEST_DEF, MEMORY.capabilities, BASE);
    store.dispatch({ type: "setEquals", field: "status", values: ["open"] });
    const before = store.getQuery();
    store.replace({ ...before, equals: { status: ["open"] } }, "board");
    expect(store.getQuery()).toBe(before);
    expect(store.getView()).toBe("board");
    store.replace({
      ...before,
      equals: { status: ["open"] },
      sort: { field: "total", direction: "asc" },
    });
    expect(store.getQuery()).not.toBe(before);
    expect(store.getQuery().equals).toBe(before.equals);
    expect(store.getQuery().sort).toEqual({ field: "total", direction: "asc" });
  });

  test("a query from outside that nothing answers becomes the default", () => {
    const store = createQueryStore(TEST_DEF, SERVER, BASE);
    store.replace({ ...BASE, equals: { region: ["north"] } });
    expect(store.getQuery()).toEqual(BASE);
    store.replace({ ...BASE, equals: { status: ["nope"] } });
    expect(store.getQuery()).toEqual(BASE);
    const open: QueryState = { ...BASE, equals: { status: ["open"] } };
    store.replace(open);
    expect(store.getQuery()).toEqual(open);
    expect(
      createQueryStore(TEST_DEF, SERVER, {
        ...BASE,
        sort: { field: "missing", direction: "asc" },
        equals: { region: ["north"] },
      }).getQuery(),
    ).toEqual(BASE);
  });
});

describe("the URL", () => {
  test("a query round-trips", () => {
    const query: QueryState = {
      ...BASE,
      equals: { status: ["open"] },
      ranges: [{ field: "total", min: "100", max: null }],
      sort: { field: "total", direction: "asc" },
      cursor: "abc",
    };
    const params = encodeQuery(TEST_DEF, query);
    expect(params.toString()).toBe(
      "f.status=open&r.total=100..&sort=total.asc&cursor=abc",
    );
    expect(decodeQuery(TEST_DEF, params)).toEqual(query);
  });

  test("several values of one field repeat the parameter", () => {
    const query: QueryState = {
      ...BASE,
      equals: { status: ["open", "done"], region: ["north"] },
    };
    const params = encodeQuery(TEST_DEF, query);
    expect(params.toString()).toBe(
      "f.status=open&f.status=done&f.region=north",
    );
    expect(decodeQuery(TEST_DEF, params)).toEqual(query);
    expect(
      decodeQuery(TEST_DEF, new URLSearchParams("f.status=open&f.status=open"))
        .equals,
    ).toEqual({ status: ["open"] });
  });

  test("the keys a grid can put in the URL are the ones its capabilities allow", () => {
    const keys = listQueryKeys(SERVER);
    expect(keys.map((key) => key.name)).toEqual([
      "f.status",
      "f.region",
      "r.created_at",
      "r.total",
      "q",
      "sort",
      "cursor",
    ]);
    expect(keys.filter((key) => key.repeated).map((key) => key.name)).toEqual([
      "f.status",
      "f.region",
      "r.created_at",
      "r.total",
    ]);
  });

  test("a field named like an object internal is just an unknown field", () => {
    const decoded = decodeQuery(
      TEST_DEF,
      new URLSearchParams("f.__proto__=x&f.constructor=y"),
    );
    expect(Object.keys(decoded.equals)).toEqual(["__proto__", "constructor"]);
    expect(validateQueryValues(TEST_DEF, decoded)).toEqual({
      code: "unknown_field",
      params: { field: "__proto__" },
    });
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  test("the search and the default sort", () => {
    const query = { ...BASE, search: "smi th" };
    const params = encodeQuery(TEST_DEF, query);
    expect(params.toString()).toBe("q=smi+th");
    expect(decodeQuery(TEST_DEF, params)).toEqual(query);
  });
});

describe("values", () => {
  test("a value outside its type is named by code", () => {
    expect(
      validateQueryValues(TEST_DEF, { ...BASE, equals: { status: ["nope"] } }),
    ).toEqual({ code: "invalid_value", params: { field: "status" } });
    expect(
      validateQueryValues(TEST_DEF, { ...BASE, equals: { missing: ["x"] } }),
    ).toEqual({ code: "unknown_field", params: { field: "missing" } });
    expect(validateQueryValues(TEST_DEF, { ...BASE, search: "ab" })).toEqual({
      code: "search_length",
      params: { min: 3, max: 80 },
    });
    expect(validateQueryValues(TEST_DEF, BASE)).toBeNull();
  });

  test("a field takes at most its cap of values, twenty by default", () => {
    const names = Array.from({ length: 21 }, (_, index) => `name ${index}`);
    expect(
      validateQueryValues(TEST_DEF, { ...BASE, equals: { name: names } }),
    ).toEqual({ code: "too_many_values", params: { field: "name", max: 20 } });
    expect(
      validateQueryValues(TEST_DEF, {
        ...BASE,
        equals: { name: names.slice(0, 20) },
      }),
    ).toBeNull();
    const capped = {
      ...TEST_DEF,
      fields: TEST_DEF.fields.map((field) =>
        field.key === "status" ? { ...field, maxValues: 1 } : field,
      ),
    };
    expect(
      validateQueryValues(capped, {
        ...BASE,
        equals: { status: ["open", "done"] },
      }),
    ).toEqual({ code: "too_many_values", params: { field: "status", max: 1 } });
    expect(
      validateQueryValues(TEST_DEF, { ...BASE, equals: { status: [] } }),
    ).toEqual({ code: "invalid_value", params: { field: "status" } });
  });
});

describe("chips", () => {
  test("every active filter and the sort get a chip, as data", () => {
    const query: QueryState = {
      ...BASE,
      equals: { status: ["open", "done"] },
      sort: { field: "total", direction: "asc" },
      ranges: [{ field: "total", min: "1000", max: null }],
    };
    const chips = listFilterChips(TEST_DEF, query);
    expect(chips).toEqual([
      {
        id: "eq:status",
        kind: "equals",
        field: "status",
        excluded: false,
        values: [
          {
            value: "open",
            text: "Open",
            reserved: null,
            clear: {
              type: "removeEqualsValue",
              field: "status",
              value: "open",
            },
          },
          {
            value: "done",
            text: "Done",
            reserved: null,
            clear: {
              type: "removeEqualsValue",
              field: "status",
              value: "done",
            },
          },
        ],
        clear: { type: "clearEquals", field: "status" },
      },
      {
        id: "range:total",
        kind: "range",
        field: "total",
        min: "10.00",
        max: null,
        preset: null,
        op: "gte",
        clear: { type: "clearRange", field: "total", at: 0 },
      },
      {
        id: "sort",
        kind: "sort",
        field: "total",
        direction: "asc",
        then: [],
        clear: { type: "setSort", field: "created_at", direction: "desc" },
      },
    ]);
    const idle = listFilterChips(TEST_DEF, BASE);
    expect(idle).toHaveLength(1);
    expect(idle[0].clear).toBeNull();
  });
});

describe("the sort under an unordered search", () => {
  const open: DataSourceCapabilities = { ...SERVER, canRun: () => true };

  test("only a return to the default sort is accepted", () => {
    const context: OfferContext = {
      capabilities: open,
      allSearchMatchesLoaded: false,
    };
    const stuck: QueryState = {
      ...BASE,
      search: "abc",
      sort: { field: "total", direction: "desc" },
    };
    expect(
      applyAction(
        TEST_DEF,
        stuck,
        { type: "setSort", field: "total", direction: "asc" },
        context,
      ),
    ).toBe(stuck);
    expect(
      applyAction(
        TEST_DEF,
        stuck,
        { type: "setSort", ...TEST_DEF.defaultSort },
        context,
      ).sort,
    ).toEqual(TEST_DEF.defaultSort);
    expect(listOffers(TEST_DEF, stuck, context).sorts).toEqual([]);
    expect(
      listOffers(TEST_DEF, stuck, {
        capabilities: open,
        allSearchMatchesLoaded: true,
      }).sorts,
    ).toEqual(["created_at", "total"]);
  });
});
