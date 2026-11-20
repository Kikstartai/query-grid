import { describe, expect, test } from "bun:test";

import { listFilterChips } from "./chips.ts";
import type { FilterOp } from "./operators.ts";
import type { QueryState } from "./query-state.ts";
import {
  listCapableOps,
  listFilterFields,
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
  type Offers,
} from "./query-actions.ts";
import { createQueryStore } from "./query-store.ts";
import { decodeQuery, encodeQuery, listQueryKeys } from "./query-url.ts";
import { validateQueryValues } from "./query-validate.ts";

const BASE = defaultQuery(TEST_DEF);
const BOUND_OPS: FilterOp[] = [
  "equals",
  "not_equals",
  "greater_than",
  "greater_or_equal",
  "less_than",
  "less_or_equal",
  "between",
  "not_between",
];

const SERVER: DataSourceCapabilities = {
  ...UNTIERED,
  holdsAllRows: false,
  searchIsOrdered: false,
  facetCountsFollowFilters: false,
  canRun: (query) =>
    query.filters.every(
      (filter) =>
        filter.field === "status" &&
        filter.op === "any_of" &&
        "values" in filter &&
        filter.values.length === 1,
    ),
  filterOps: {
    status: ["any_of"],
    region: ["any_of"],
    created_at: ["between"],
    total: ["between"],
  },
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

function listOfferedFields(offers: Offers, op: FilterOp): string[] {
  return Object.entries(offers.filters)
    .filter(([, ops]) => ops.some((offer) => offer.op === op && offer.offered))
    .map(([key]) => key);
}

describe("filter operators", () => {
  const opsOf = (capabilities: DataSourceCapabilities) =>
    Object.fromEntries(
      listFilterFields(TEST_DEF, capabilities).map((field) => [
        field.key,
        listCapableOps(capabilities, field.key),
      ]),
    );

  test("on a server grid the allowed filters are the ones the capabilities name", () => {
    expect(opsOf(SERVER)).toEqual({
      created_at: ["between"],
      total: ["between"],
      status: ["any_of"],
      region: ["any_of"],
    });
    expect(opsOf({ ...SERVER, filterOps: { name: ["equals"] } })).toEqual({
      name: ["equals"],
    });
  });

  test("a list of keys picks the filters and their order, skipping a field with none", () => {
    expect(
      listFilterFields(TEST_DEF, SERVER, ["region", "note", "status"]).map(
        (field) => field.key,
      ),
    ).toEqual(["region", "status"]);
  });

  test("on a client grid every field is filterable, by its type and options", () => {
    const text: FilterOp[] = [
      "equals",
      "not_equals",
      "contains",
      "not_contains",
      "starts_with",
      "ends_with",
    ];
    expect(opsOf(memoryCapabilities(TEST_DEF))).toEqual({
      id: ["any_of", "none_of"],
      number: BOUND_OPS,
      created_at: BOUND_OPS,
      total: BOUND_OPS,
      status: ["any_of"],
      region: ["any_of"],
      name: text,
      note: [...text, "blank", "not_blank"],
    });
  });
});

describe("actions", () => {
  test("an action the capabilities refuse leaves the query alone", () => {
    expect(
      applyAction(
        TEST_DEF,
        BASE,
        {
          type: "setFilter",
          filter: { field: "region", op: "any_of", values: ["north"] },
        },
        CAPPED,
      ),
    ).toBe(BASE);
  });

  test("a list takes several values, without duplicates", () => {
    const set = applyAction(
      TEST_DEF,
      BASE,
      {
        type: "setFilter",
        filter: {
          field: "status",
          op: "any_of",
          values: ["open", "done", "open"],
        },
      },
      MEMORY,
    );
    expect(set.filters).toEqual([
      { field: "status", op: "any_of", values: ["open", "done"] },
    ]);
    const one = applyAction(
      TEST_DEF,
      set,
      { type: "removeFilterValue", field: "status", at: 0, value: "open" },
      MEMORY,
    );
    expect(one.filters).toEqual([
      { field: "status", op: "any_of", values: ["done"] },
    ]);
    const none = applyAction(
      TEST_DEF,
      one,
      { type: "removeFilterValue", field: "status", at: 0, value: "done" },
      MEMORY,
    );
    expect(none.filters).toEqual([]);
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
        {
          type: "setFilter",
          filter: { field: "status", op: "any_of", values: ["open", "done"] },
        },
        context,
      ),
    ).toBe(BASE);
    expect(
      applyAction(
        capped,
        BASE,
        {
          type: "setFilter",
          filter: { field: "status", op: "any_of", values: ["open"] },
        },
        context,
      ).filters,
    ).toEqual([{ field: "status", op: "any_of", values: ["open"] }]);
  });

  test("an empty value list clears the field", () => {
    const set: QueryState = {
      ...BASE,
      filters: [{ field: "status", op: "any_of", values: ["open"] }],
    };
    expect(
      applyAction(
        TEST_DEF,
        set,
        {
          type: "setFilter",
          filter: { field: "status", op: "any_of", values: [] },
        },
        MEMORY,
      ).filters,
    ).toEqual([]);
  });

  test("any of is offered only where the capabilities answer it", () => {
    const capped = listOffers(TEST_DEF, BASE, CAPPED);
    expect(listOfferedFields(capped, "any_of")).toEqual(["status"]);
    const memory = listOffers(TEST_DEF, BASE, MEMORY);
    expect(listOfferedFields(memory, "any_of")).toEqual([
      "id",
      "status",
      "region",
    ]);
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
    filters: [{ field: "status", op: "any_of", values: ["open"] }],
    sort: { field: "total", direction: "desc" },
  };

  test("it is a code with the fields that block it, never a sentence", () => {
    expect(
      explainUnavailable(
        TEST_DEF,
        byTotal,
        { kind: "filter", field: "region", op: "any_of" },
        CAPPED,
      ),
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
        TEST_DEF,
        byTotal,
        { kind: "filter", field: "created_at", op: "greater_or_equal" },
        CAPPED,
      ).code,
    ).toBe("range_needs_sort");
    expect(
      explainUnavailable(
        TEST_DEF,
        byTotal,
        { kind: "sort", field: "name" },
        CAPPED,
      ),
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
    expect(
      explainUnavailable(TEST_DEF, byTotal, { kind: "search" }, CAPPED).code,
    ).toBe("search_alone");
  });

  test("a search names why the sort is held", () => {
    const search: QueryState = { ...BASE, search: "abc" };
    const target = { kind: "sort", field: "total" } as const;
    expect(explainUnavailable(TEST_DEF, search, target, CAPPED).code).toBe(
      "search_unordered",
    );
    expect(explainUnavailable(TEST_DEF, search, target, COMPLETE).code).toBe(
      "no_sort_index",
    );
    expect(
      explainUnavailable(
        TEST_DEF,
        search,
        { kind: "filter", field: "total", op: "between" },
        CAPPED,
      ),
    ).toMatchObject({ code: "search_no_combine", field: "total" });
  });
});

describe("the memory source", () => {
  test("every field is a filter and a sort, in any combination", () => {
    const busy: QueryState = {
      ...BASE,
      filters: [
        { field: "status", op: "any_of", values: ["open", "done"] },
        { field: "region", op: "any_of", values: ["north"] },
        { field: "total", op: "greater_or_equal", value: "1" },
      ],
      search: "abc",
      sort: { field: "name", direction: "asc" },
    };
    expect(MEMORY.capabilities.canRun(busy)).toBe(true);
    const offers = listOffers(TEST_DEF, busy, MEMORY);
    expect(listOfferedFields(offers, "any_of")).toEqual([
      "id",
      "status",
      "region",
    ]);
    expect(listOfferedFields(offers, "between")).toEqual([
      "number",
      "created_at",
      "total",
    ]);
    expect(listOfferedFields(offers, "contains")).toEqual(["name", "note"]);
    expect(offers.sorts).toEqual(TEST_DEF.fields.map((field) => field.key));
    expect(offers.search).toBe(true);
  });

  test("no search fields means no search", () => {
    const bare = memoryCapabilities({ ...TEST_DEF, search: undefined });
    expect(bare.canRun({ ...BASE, search: "abc" })).toBe(false);
    expect(bare.searchFields).toEqual([]);
  });

  test("every reachable state is answerable, with several bounds included", () => {
    const keys = ["status", "total", "created_at"];
    const small = {
      ...TEST_DEF,
      search: [],
      fields: TEST_DEF.fields.filter((field) => keys.includes(field.key)),
    };
    const context = { ...MEMORY, capabilities: memoryCapabilities(small) };
    const states = enumerateReachableStates(small, context);
    expect(states.every(context.capabilities.canRun)).toBe(true);
    expect(
      states.some(
        (state) =>
          state.filters.filter((filter) => BOUND_OPS.includes(filter.op))
            .length > 1,
      ),
    ).toBe(true);
  });

  test("the store applies its capabilities", () => {
    const store = createQueryStore(TEST_DEF, MEMORY.capabilities, BASE);
    store.dispatch({ type: "setSort", field: "name", direction: "asc" });
    store.dispatch({
      type: "setFilter",
      filter: { field: "region", op: "any_of", values: ["north"] },
    });
    store.dispatch({
      type: "setFilter",
      filter: { field: "total", op: "between", min: "5", max: "9" },
    });
    expect(store.getQuery()).toMatchObject({
      filters: [
        { field: "region", op: "any_of", values: ["north"] },
        { field: "total", op: "between", min: "5", max: "9" },
      ],
      sort: { field: "name", direction: "asc" },
    });
  });
});

describe("the store and browser history", () => {
  test("a filter, sort or view change asks for a new history entry", () => {
    const store = createQueryStore(TEST_DEF, MEMORY.capabilities, BASE);
    expect(store.getHistoryWrite()).toBe("replace");
    store.dispatch({
      type: "setFilter",
      filter: { field: "status", op: "any_of", values: ["open"] },
    });
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
    const next: QueryState = {
      ...BASE,
      filters: [{ field: "region", op: "any_of", values: ["north"] }],
    };
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
    store.dispatch({
      type: "setFilter",
      filter: { field: "status", op: "any_of", values: ["open"] },
    });
    const before = store.getQuery();
    const listOpen = (): QueryState["filters"] => [
      { field: "status", op: "any_of", values: ["open"] },
    ];
    store.replace({ ...before, filters: listOpen() }, "board");
    expect(store.getQuery()).toBe(before);
    expect(store.getView()).toBe("board");
    store.replace({
      ...before,
      filters: listOpen(),
      sort: { field: "total", direction: "asc" },
    });
    expect(store.getQuery()).not.toBe(before);
    expect(store.getQuery().filters).toBe(before.filters);
    expect(store.getQuery().sort).toEqual({ field: "total", direction: "asc" });
  });

  test("a query from outside that nothing answers becomes the default", () => {
    const store = createQueryStore(TEST_DEF, SERVER, BASE);
    store.replace({
      ...BASE,
      filters: [{ field: "region", op: "any_of", values: ["north"] }],
    });
    expect(store.getQuery()).toEqual(BASE);
    store.replace({
      ...BASE,
      filters: [{ field: "status", op: "any_of", values: ["nope"] }],
    });
    expect(store.getQuery()).toEqual(BASE);
    const open: QueryState = {
      ...BASE,
      filters: [{ field: "status", op: "any_of", values: ["open"] }],
    };
    store.replace(open);
    expect(store.getQuery()).toEqual(open);
    expect(
      createQueryStore(TEST_DEF, SERVER, {
        ...BASE,
        sort: { field: "missing", direction: "asc" },
        filters: [{ field: "region", op: "any_of", values: ["north"] }],
      }).getQuery(),
    ).toEqual(BASE);
  });
});

describe("the URL", () => {
  test("a query round-trips", () => {
    const query: QueryState = {
      ...BASE,
      filters: [
        { field: "status", op: "any_of", values: ["open"] },
        { field: "total", op: "greater_or_equal", value: "100" },
      ],
      sort: { field: "total", direction: "asc" },
      cursor: "abc",
    };
    const params = encodeQuery(TEST_DEF, query);
    expect(params.toString()).toBe(
      "f.status.any_of=open&f.total.greater_or_equal=100&sort=total.asc&cursor=abc",
    );
    expect(decodeQuery(TEST_DEF, params)).toEqual(query);
  });

  test("several values of one field repeat the parameter", () => {
    const query: QueryState = {
      ...BASE,
      filters: [
        { field: "status", op: "any_of", values: ["open", "done"] },
        { field: "region", op: "any_of", values: ["north"] },
      ],
    };
    const params = encodeQuery(TEST_DEF, query);
    expect(params.toString()).toBe(
      "f.status.any_of=open&f.status.any_of=done&f.region.any_of=north",
    );
    expect(decodeQuery(TEST_DEF, params)).toEqual(query);
    expect(
      decodeQuery(
        TEST_DEF,
        new URLSearchParams("f.status.any_of=open&f.status.any_of=open"),
      ).filters,
    ).toEqual([{ field: "status", op: "any_of", values: ["open"] }]);
  });

  test("the keys a grid can put in the URL are the ones its capabilities allow", () => {
    const keys = listQueryKeys(SERVER);
    expect(keys.map((key) => key.name)).toEqual([
      "f.status.any_of",
      "f.region.any_of",
      "f.created_at.between",
      "f.total.between",
      "q",
      "sort",
      "cursor",
    ]);
    expect(keys.filter((key) => key.repeated).map((key) => key.name)).toEqual([
      "f.status.any_of",
      "f.region.any_of",
      "f.created_at.between",
      "f.total.between",
    ]);
  });

  test("a field named like an object internal is just an unknown field", () => {
    const decoded = decodeQuery(
      TEST_DEF,
      new URLSearchParams("f.__proto__.any_of=x&f.constructor.any_of=y"),
    );
    expect(decoded.filters.map((filter) => filter.field)).toEqual([
      "__proto__",
      "constructor",
    ]);
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
      validateQueryValues(TEST_DEF, {
        ...BASE,
        filters: [{ field: "status", op: "any_of", values: ["nope"] }],
      }),
    ).toEqual({ code: "invalid_value", params: { field: "status" } });
    expect(
      validateQueryValues(TEST_DEF, {
        ...BASE,
        filters: [{ field: "missing", op: "any_of", values: ["x"] }],
      }),
    ).toEqual({ code: "unknown_field", params: { field: "missing" } });
    expect(validateQueryValues(TEST_DEF, { ...BASE, search: "ab" })).toEqual({
      code: "search_length",
      params: { min: 3, max: 80 },
    });
    expect(validateQueryValues(TEST_DEF, BASE)).toBeNull();
  });

  test("a field takes at most its cap of values, twenty by default", () => {
    const ids = Array.from(
      { length: 21 },
      (_, index) =>
        `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
    );
    expect(
      validateQueryValues(TEST_DEF, {
        ...BASE,
        filters: [{ field: "id", op: "any_of", values: ids }],
      }),
    ).toEqual({ code: "too_many_values", params: { field: "id", max: 20 } });
    expect(
      validateQueryValues(TEST_DEF, {
        ...BASE,
        filters: [{ field: "id", op: "any_of", values: ids.slice(0, 20) }],
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
        filters: [{ field: "status", op: "any_of", values: ["open", "done"] }],
      }),
    ).toEqual({ code: "too_many_values", params: { field: "status", max: 1 } });
    expect(
      validateQueryValues(TEST_DEF, {
        ...BASE,
        filters: [{ field: "status", op: "any_of", values: [] }],
      }),
    ).toEqual({ code: "invalid_value", params: { field: "status" } });
  });
});

describe("chips", () => {
  test("every active filter and the sort get a chip, as data", () => {
    const query: QueryState = {
      ...BASE,
      filters: [
        { field: "status", op: "any_of", values: ["open", "done"] },
        { field: "total", op: "greater_or_equal", value: "1000" },
      ],
      sort: { field: "total", direction: "asc" },
    };
    const chips = listFilterChips(TEST_DEF, query);
    expect(chips).toEqual([
      {
        id: "filter:status:any_of",
        kind: "filter",
        field: "status",
        op: "any_of",
        operands: [],
        preset: null,
        values: [
          {
            value: "open",
            text: "Open",
            clear: {
              type: "removeFilterValue",
              field: "status",
              at: 0,
              value: "open",
            },
          },
          {
            value: "done",
            text: "Done",
            clear: {
              type: "removeFilterValue",
              field: "status",
              at: 0,
              value: "done",
            },
          },
        ],
        clear: { type: "removeFilter", field: "status", at: 0 },
      },
      {
        id: "filter:total:greater_or_equal",
        kind: "filter",
        field: "total",
        op: "greater_or_equal",
        operands: ["10.00"],
        preset: null,
        values: [],
        clear: { type: "removeFilter", field: "total", at: 0 },
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
