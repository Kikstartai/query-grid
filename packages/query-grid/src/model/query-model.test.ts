import { describe, expect, test } from "bun:test";

import { listFilterChips } from "./chips.ts";
import {
  listFilterFields,
  resolveFilterKind,
  type Capabilities,
  type QueryRules,
  type QueryState,
} from "./field-types.ts";
import { TEST_DEF, TEST_QUICK_FIELDS } from "./grid-def.fixture.ts";
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

const SERVER: Capabilities = {
  mode: "server",
  isAnswerable: (query) =>
    Object.keys(query.equals).every((key) => key === "status") &&
    (query.equals.status?.length ?? 1) === 1,
  equalsFields: ["status", "region"],
  rangeFields: ["created_at", "total"],
  sortFields: ["created_at", "total"],
  quickFields: TEST_QUICK_FIELDS,
  isFacetCountShown: () => true,
};
const CAPPED: QueryRules = { capabilities: SERVER, quickComplete: false };
const COMPLETE: QueryRules = { capabilities: SERVER, quickComplete: true };
const MEMORY: QueryRules = {
  capabilities: memoryCapabilities(TEST_DEF, TEST_QUICK_FIELDS),
  quickComplete: false,
};

describe("filter kinds", () => {
  const kindsOf = (capabilities: Capabilities) =>
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
    const rules: QueryRules = {
      capabilities: memoryCapabilities(capped),
      quickComplete: false,
    };
    expect(
      applyAction(
        capped,
        BASE,
        { type: "setEquals", field: "status", values: ["open", "done"] },
        rules,
      ),
    ).toBe(BASE);
    expect(listOffers(capped, BASE, rules).multi).toEqual([
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

  test("setting the quick filter returns to the default sort on a server", () => {
    const byTotal: QueryState = {
      ...BASE,
      sort: { field: "total", direction: "asc" },
    };
    const action = { type: "setQuick", value: "abc" } as const;
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
      range: null,
      sort: "total",
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
      range: null,
      sort: "total",
    });
    expect(explainUnavailable(byTotal, { kind: "quick" }, CAPPED).code).toBe(
      "quick_alone",
    );
  });

  test("a quick filter names why the sort is held", () => {
    const quick: QueryState = { ...BASE, quick: "abc" };
    const target = { kind: "sort", field: "total" } as const;
    expect(explainUnavailable(quick, target, CAPPED).code).toBe(
      "quick_unordered",
    );
    expect(explainUnavailable(quick, target, COMPLETE).code).toBe(
      "no_sort_index",
    );
    expect(
      explainUnavailable(quick, { kind: "equals", field: "status" }, CAPPED)
        .code,
    ).toBe("quick_no_combine");
  });
});

describe("memory mode", () => {
  test("every field is a filter and a sort, in any combination", () => {
    const busy: QueryState = {
      ...BASE,
      equals: { status: ["open", "done"], region: ["north"] },
      range: { field: "total", min: "1", max: null },
      quick: "abc",
      sort: { field: "name", direction: "asc" },
    };
    expect(MEMORY.capabilities.isAnswerable(busy)).toBe(true);
    const offers = listOffers(TEST_DEF, busy, MEMORY);
    expect(offers.equals).toEqual(["id", "status", "region", "name", "note"]);
    expect(offers.ranges).toEqual(["number", "created_at", "total"]);
    expect(offers.sorts).toEqual(TEST_DEF.fields.map((field) => field.key));
    expect(offers.quick).toBe(true);
  });

  test("no quick fields means no quick filter", () => {
    const bare = memoryCapabilities(TEST_DEF);
    expect(bare.isAnswerable({ ...BASE, quick: "abc" })).toBe(false);
    expect(bare.quickFields).toEqual([]);
  });

  test("every reachable state is answerable, with several values included", () => {
    const states = enumerateReachableStates(TEST_DEF, MEMORY);
    expect(states.every(MEMORY.capabilities.isAnswerable)).toBe(true);
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
      range: { field: "total", min: "5", max: "9" },
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
    store.dispatch({ type: "setQuick", value: "abc" });
    expect(store.getHistoryWrite()).toBe("replace");
    store.setView("list");
    expect(store.getHistoryWrite()).toBe("push");
    store.dispatch({ type: "clearQuick" });
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
      equals: { status: ["open"] },
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

  test("the keys a def can put in the URL are known up front", () => {
    const keys = listQueryKeys(TEST_DEF);
    expect(keys.map((key) => key.name)).toEqual([
      ...TEST_DEF.fields.map((field) => `f.${field.key}`),
      "r.number",
      "r.created_at",
      "r.total",
      "q",
      "sort",
      "cursor",
    ]);
    expect(keys.filter((key) => key.repeated).map((key) => key.name)).toEqual(
      TEST_DEF.fields.map((field) => `f.${field.key}`),
    );
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

  test("the quick filter and the default sort", () => {
    const query = { ...BASE, quick: "smi th" };
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
    expect(validateQueryValues(TEST_DEF, { ...BASE, quick: "ab" })).toEqual({
      code: "quick_length",
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
      range: { field: "total", min: "1000", max: null },
    };
    const chips = listFilterChips(TEST_DEF, query);
    expect(chips).toEqual([
      {
        id: "eq:status",
        kind: "equals",
        field: "status",
        values: [
          {
            value: "open",
            text: "Open",
            clear: {
              type: "removeEqualsValue",
              field: "status",
              value: "open",
            },
          },
          {
            value: "done",
            text: "Done",
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
        min: "$10.00",
        max: null,
        clear: { type: "clearRange" },
      },
      {
        id: "sort",
        kind: "sort",
        field: "total",
        direction: "asc",
        clear: { type: "setSort", field: "created_at", direction: "desc" },
      },
    ]);
    const idle = listFilterChips(TEST_DEF, BASE);
    expect(idle).toHaveLength(1);
    expect(idle[0].clear).toBeNull();
  });
});

describe("the sort under an unordered quick filter", () => {
  const open: Capabilities = { ...SERVER, isAnswerable: () => true };

  test("only a return to the default sort is accepted", () => {
    const rules: QueryRules = { capabilities: open, quickComplete: false };
    const stuck: QueryState = {
      ...BASE,
      quick: "abc",
      sort: { field: "total", direction: "desc" },
    };
    expect(
      applyAction(
        TEST_DEF,
        stuck,
        { type: "setSort", field: "total", direction: "asc" },
        rules,
      ),
    ).toBe(stuck);
    expect(
      applyAction(
        TEST_DEF,
        stuck,
        { type: "setSort", ...TEST_DEF.defaultSort },
        rules,
      ).sort,
    ).toEqual(TEST_DEF.defaultSort);
    expect(listOffers(TEST_DEF, stuck, rules).sorts).toEqual([]);
    expect(
      listOffers(TEST_DEF, stuck, { capabilities: open, quickComplete: true })
        .sorts,
    ).toEqual(["created_at", "total"]);
  });
});
