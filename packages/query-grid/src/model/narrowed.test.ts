import { describe, expect, test } from "bun:test";

import { listFilterChips } from "./chips.ts";
import type { GridRow } from "./grid-def.ts";
import type { FilterOp } from "./operators.ts";
import type { Filter, QueryState } from "./query-state.ts";
import type {
  NarrowedResult,
  NarrowedState,
  OfferContext,
} from "./capabilities.ts";
import {
  createTestSource,
  settle,
  TEST_DEF,
  TEST_INDEXES,
} from "./grid-def.fixture.ts";
import {
  indexCapabilities,
  isCombineOr,
  isQueryRunnable,
  planQuery,
} from "./indexes.ts";
import type { IndexedGridDef } from "./grid-def.ts";
import { createMemorySource } from "./memory-source.ts";
import {
  applyAction,
  defaultQuery,
  explainUnavailable,
  listOffers,
  type Offers,
} from "./query-actions.ts";
import { withLiteralFilters } from "./literal-filters.ts";
import { createQueryStore } from "./query-store.ts";
import { decodeQuery, encodeQuery, listQueryKeys } from "./query-url.ts";
import { validateQueryValues } from "./query-validate.ts";
import { createNarrowedStore } from "./summary-stores.ts";

const DEF: IndexedGridDef = { ...TEST_DEF, indexes: TEST_INDEXES };
const BASE = defaultQuery(DEF);
const CAPABILITIES = indexCapabilities(TEST_INDEXES, {
  facetField: "status",
  searchFields: ["name", "number"],
  fields: DEF.fields,
});
const STATUS_OPEN: Filter = { field: "status", op: "any_of", values: ["open"] };
const REGION_NORTH: Filter = {
  field: "region",
  op: "any_of",
  values: ["north"],
};
const NOTE_GIFT: Filter = { field: "note", op: "contains", value: "gift" };
const OPEN: QueryState = { ...BASE, filters: [STATUS_OPEN] };
const TOTAL_RANGE: Filter = {
  field: "total",
  op: "between",
  min: "100",
  max: "900",
};
const CREATED_RANGE: Filter = {
  field: "created_at",
  op: "greater_or_equal",
  value: "2026-01-01",
};
const COMPARE_OPS: FilterOp[] = [
  "equals",
  "not_equals",
  "greater_than",
  "greater_or_equal",
  "less_than",
  "less_or_equal",
  "between",
  "not_between",
];
const TEXT_OPS: FilterOp[] = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
];
const signal = new AbortController().signal;

function narrowedFor(
  query: QueryState,
  result: Partial<NarrowedResult> = {},
): NarrowedState {
  return {
    limit: 1000,
    and: { rows: 40, over: false, capped: false },
    or: null,
    ...result,
    andBasis: CAPABILITIES.narrowBasis({ ...query, combine: "and" }),
    orBasis: CAPABILITIES.narrowBasis({ ...query, combine: "or" }),
  };
}

function contextFor(
  query: QueryState,
  result?: Partial<NarrowedResult>,
): OfferContext {
  return {
    capabilities: CAPABILITIES,
    allSearchMatchesLoaded: false,
    narrowed: narrowedFor(query, result),
  };
}

function listOfferedFields(offers: Offers, op: FilterOp): string[] {
  return Object.entries(offers.filters)
    .filter(([, ops]) => ops.some((offer) => offer.op === op && offer.offered))
    .map(([key]) => key);
}

function listOfferedOps(offers: Offers, key: string): FilterOp[] {
  return (offers.filters[key] ?? [])
    .filter((offer) => offer.offered)
    .map((offer) => offer.op);
}

const UNKNOWN: OfferContext = {
  capabilities: CAPABILITIES,
  allSearchMatchesLoaded: false,
  narrowed: null,
};

describe("the plan of a query", () => {
  test("an indexed query is its own core and is not narrowed", () => {
    const plan = planQuery(TEST_INDEXES, OPEN);
    expect(plan).toEqual({
      core: OPEN,
      narrowed: false,
      budgeted: false,
      terms: null,
    });
  });

  test("a range off the sort, a second range and a contains run over the core's rows", () => {
    const offSort = planQuery(TEST_INDEXES, {
      ...BASE,
      filters: [STATUS_OPEN, TOTAL_RANGE],
    });
    expect(offSort?.narrowed).toBe(true);
    expect(offSort?.core.filters).toEqual([STATUS_OPEN]);
    const two = planQuery(TEST_INDEXES, {
      ...BASE,
      filters: [CREATED_RANGE, TOTAL_RANGE],
    });
    expect(two?.narrowed).toBe(true);
    expect(two?.core.filters).toEqual([CREATED_RANGE]);
    const contains = planQuery(TEST_INDEXES, {
      ...BASE,
      filters: [STATUS_OPEN, NOTE_GIFT],
    });
    expect(contains).toMatchObject({ narrowed: true, terms: null });
    expect(contains?.core.filters).toEqual([STATUS_OPEN]);
  });

  test("a range on the sort of an index with no range falls into the narrowed part", () => {
    const plan = planQuery(TEST_INDEXES, {
      ...BASE,
      filters: [STATUS_OPEN, CREATED_RANGE],
    });
    expect(plan?.narrowed).toBe(true);
    expect(plan?.core.filters).toEqual([STATUS_OPEN]);
  });

  test("a query whose equality filters no index pairs has no plan", () => {
    expect(
      planQuery(TEST_INDEXES, {
        ...BASE,
        filters: [STATUS_OPEN, REGION_NORTH, NOTE_GIFT],
      }),
    ).toBeNull();
  });

  test("match any needs two filters, and counts each one through its own index", () => {
    expect(isCombineOr({ ...OPEN, combine: "or" })).toBe(false);
    expect(planQuery(TEST_INDEXES, { ...OPEN, combine: "or" })?.narrowed).toBe(
      false,
    );
    const either: QueryState = {
      ...BASE,
      combine: "or",
      filters: [STATUS_OPEN, REGION_NORTH, TOTAL_RANGE],
    };
    const plan = planQuery(TEST_INDEXES, either);
    expect(plan?.narrowed).toBe(true);
    expect(plan?.terms?.map((term) => term.filters)).toEqual([
      [STATUS_OPEN],
      [REGION_NORTH],
      [TOTAL_RANGE],
    ]);
    expect(plan?.terms?.map((term) => term.sort.field)).toEqual([
      "created_at",
      "created_at",
      "total",
    ]);
    expect(plan?.core.filters).toEqual([]);
  });

  test("a term no index counts leaves the whole table as the set", () => {
    const plan = planQuery(TEST_INDEXES, {
      ...BASE,
      combine: "or",
      filters: [STATUS_OPEN, NOTE_GIFT],
    });
    expect(plan).toMatchObject({ narrowed: true, terms: null });
  });

  test("the server's rule: any range field and any text field, and never beside the search", () => {
    const ranged: QueryState = { ...BASE, filters: [STATUS_OPEN, TOTAL_RANGE] };
    expect(isQueryRunnable(DEF, ranged)).toBe(true);
    expect(CAPABILITIES.canRun(ranged)).toBe(true);
    expect(CAPABILITIES.isNarrowed(ranged)).toBe(true);
    expect(CAPABILITIES.isNarrowed(OPEN)).toBe(false);
    expect(
      isQueryRunnable(DEF, {
        ...BASE,
        filters: [
          STATUS_OPEN,
          { field: "status", op: "contains", value: "op" },
        ] as Filter[],
      }),
    ).toBe(false);
    expect(
      isQueryRunnable(DEF, { ...BASE, search: "abc", filters: [NOTE_GIFT] }),
    ).toBe(false);
    expect(
      isQueryRunnable(DEF, {
        ...BASE,
        search: "abc",
        combine: "or",
        filters: [STATUS_OPEN, REGION_NORTH],
      }),
    ).toBe(false);
    expect(CAPABILITIES.filterOps).toEqual({
      number: COMPARE_OPS,
      created_at: COMPARE_OPS,
      total: COMPARE_OPS,
      status: ["any_of"],
      region: ["any_of"],
      name: TEXT_OPS,
      note: [...TEXT_OPS, "blank", "not_blank"],
    });
    const bare = indexCapabilities(TEST_INDEXES);
    expect(bare.filterOps.name).toBeUndefined();
    expect(bare.filterOps.note).toBeUndefined();
    expect(bare.canRun(ranged)).toBe(false);
  });
});

describe("offers under the narrowed-set limit", () => {
  test("within the limit every expensive control is offered", () => {
    const offers = listOffers(DEF, OPEN, contextFor(OPEN));
    expect(listOfferedFields(offers, "between")).toEqual([
      "number",
      "created_at",
      "total",
    ]);
    expect(listOfferedFields(offers, "contains")).toEqual(["name", "note"]);
    expect(listOfferedOps(offers, "note")).toEqual([
      ...TEXT_OPS,
      "blank",
      "not_blank",
    ]);
  });

  test("over the limit only what the index answers is offered, with the size as the reason", () => {
    const base = contextFor(BASE, {
      and: { rows: 1000, over: true, capped: true },
    });
    const offers = listOffers(DEF, BASE, base);
    expect(listOfferedFields(offers, "between")).toEqual(["created_at"]);
    expect(listOfferedOps(offers, "created_at")).toEqual([
      "equals",
      "greater_than",
      "greater_or_equal",
      "less_than",
      "less_or_equal",
      "between",
    ]);
    expect(listOfferedFields(offers, "contains")).toEqual([]);
    expect(listOfferedOps(offers, "note")).toEqual([]);
    expect(
      explainUnavailable(
        DEF,
        BASE,
        { kind: "filter", field: "total", op: "between" },
        base,
      ),
    ).toEqual({
      code: "narrow_first",
      field: "total",
      filters: [],
      ranges: [],
      sort: "created_at",
      rows: 1000,
      capped: true,
      narrowBy: ["status", "region"],
    });
    expect(
      explainUnavailable(
        DEF,
        BASE,
        { kind: "filter", field: "note", op: "contains" },
        base,
      ).code,
    ).toBe("narrow_first");
    expect(
      explainUnavailable(
        DEF,
        BASE,
        { kind: "filter", field: "note", op: "blank" },
        base,
      ).code,
    ).toBe("narrow_first");
    expect(
      applyAction(DEF, BASE, { type: "setFilter", filter: NOTE_GIFT }, base),
    ).toBe(BASE);
  });

  test("before the size is known nothing expensive is offered", () => {
    const offers = listOffers(DEF, OPEN, UNKNOWN);
    expect(listOfferedFields(offers, "between")).toEqual([]);
    expect(listOfferedFields(offers, "contains")).toEqual([]);
    expect(
      explainUnavailable(
        DEF,
        OPEN,
        { kind: "filter", field: "note", op: "contains" },
        UNKNOWN,
      ).code,
    ).toBe("narrow_counting");
    const stale = contextFor(BASE);
    expect(listOfferedFields(listOffers(DEF, OPEN, stale), "contains")).toEqual(
      [],
    );
  });

  test("match any is gated by the sum of its terms", () => {
    const two: QueryState = { ...BASE, filters: [STATUS_OPEN, REGION_NORTH] };
    const unpaired: OfferContext = {
      ...contextFor(two, { or: { rows: 70, over: false, capped: false } }),
    };
    expect(listOffers(DEF, two, unpaired).combineOr).toBe(true);
    expect(
      applyAction(DEF, two, { type: "setCombine", combine: "or" }, unpaired)
        .combine,
    ).toBe("or");
    const over = contextFor(two, {
      or: { rows: 4000, over: true, capped: false },
    });
    expect(listOffers(DEF, two, over).combineOr).toBe(false);
    expect(
      explainUnavailable(DEF, two, { kind: "combine" }, over),
    ).toMatchObject({
      code: "narrow_first",
      rows: 4000,
      capped: false,
    });
    expect(listOffers(DEF, OPEN, contextFor(OPEN)).combineOr).toBe(true);
    const capped = contextFor(two, {
      or: { rows: 1800, over: true, capped: true },
    });
    expect(
      explainUnavailable(DEF, two, { kind: "combine" }, capped),
    ).toMatchObject({
      rows: 1800,
      capped: true,
      narrowBy: [],
    });
  });

  test("a query already over a narrowed set may change its filters: the server decides", () => {
    const narrowed: QueryState = { ...BASE, filters: [STATUS_OPEN, NOTE_GIFT] };
    const context = contextFor(narrowed);
    const wider = applyAction(
      DEF,
      narrowed,
      { type: "removeFilter", field: "status" },
      context,
    );
    expect(wider.filters).toEqual([NOTE_GIFT]);
    const plain = applyAction(
      DEF,
      OPEN,
      { type: "removeFilter", field: "status" },
      context,
    );
    expect(plain.filters).toEqual([]);
  });

  test("the search and the expensive controls exclude each other", () => {
    const searching: QueryState = { ...BASE, search: "abc" };
    const context = contextFor(searching);
    const offers = listOffers(DEF, searching, context);
    expect(listOfferedFields(offers, "contains")).toEqual([]);
    expect(listOfferedFields(offers, "between")).toEqual([]);
    expect(
      explainUnavailable(
        DEF,
        searching,
        { kind: "filter", field: "note", op: "contains" },
        context,
      ).code,
    ).toBe("search_no_combine");
    const narrowed: QueryState = { ...BASE, filters: [STATUS_OPEN, NOTE_GIFT] };
    expect(listOffers(DEF, narrowed, contextFor(narrowed)).search).toBe(false);
  });
});

describe("the basis a size is known for", () => {
  const wrapped = withLiteralFilters(
    DEF,
    createTestSource(CAPABILITIES),
  ).capabilities;

  test("an expensive part leaves the basis as it was, so a known size answers it", () => {
    const basis = wrapped.narrowBasis(OPEN);
    expect(
      wrapped.narrowBasis({ ...BASE, filters: [STATUS_OPEN, TOTAL_RANGE] }),
    ).toBe(basis);
    expect(
      wrapped.narrowBasis({
        ...BASE,
        filters: [
          STATUS_OPEN,
          { field: "total", op: "less_than", value: "500" },
          { field: "number", op: "greater_or_equal", value: "1" },
          NOTE_GIFT,
          { field: "note", op: "blank" },
        ],
      }),
    ).toBe(basis);
    expect(wrapped.narrowBasis(BASE)).not.toBe(basis);
  });

  test("a preset on the indexed range is part of the basis, by its name", () => {
    const preset = (name: "today" | "this-year"): QueryState => ({
      ...BASE,
      filters: [{ field: "created_at", op: "in_period", preset: name }],
    });
    expect(wrapped.narrowBasis(preset("today"))).not.toBe(
      wrapped.narrowBasis(preset("this-year")),
    );
    expect(wrapped.narrowBasis(preset("today"))).toBe(
      wrapped.narrowBasis(preset("today")),
    );
    expect(wrapped.narrowBasis(preset("today"))).not.toBe(
      wrapped.narrowBasis(BASE),
    );
  });
});

describe("the narrowed-size store", () => {
  test("it follows the filters and hands the query store the sizes with their basis", async () => {
    const asked: QueryState[] = [];
    const source = createTestSource(CAPABILITIES, {
      fetchNarrowed: async (query) => {
        asked.push(query);
        return {
          limit: 1000,
          and: { rows: asked.length, over: false, capped: false },
          or: null,
        };
      },
    });
    const store = createQueryStore(DEF, CAPABILITIES, BASE);
    const narrowed = createNarrowedStore(store, source);
    const texts = () =>
      listOfferedFields(
        listOffers(DEF, store.getQuery(), store.getOfferContext()),
        "contains",
      );
    expect(store.getOfferContext().narrowed).toBeNull();
    narrowed.connect();
    await settle();
    expect(store.getOfferContext().narrowed).toMatchObject({
      and: { rows: 1, over: false, capped: false },
      andBasis: CAPABILITIES.narrowBasis(BASE),
    });
    expect(texts()).toEqual(["name", "note"]);
    store.dispatch({ type: "setFilter", filter: STATUS_OPEN });
    expect(texts()).toEqual([]);
    await settle();
    expect(asked).toHaveLength(2);
    expect(texts()).toEqual(["name", "note"]);
    store.dispatch({ type: "setSort", field: "total", direction: "asc" });
    await settle();
    expect(asked).toHaveLength(2);
  });
});

describe("the URL, validation and chips", () => {
  const query: QueryState = {
    ...BASE,
    combine: "or",
    filters: [
      STATUS_OPEN,
      TOTAL_RANGE,
      CREATED_RANGE,
      { field: "note", op: "contains", value: "gift wrap" },
    ],
  };
  const keysOf = (field: string, ops: FilterOp[]) =>
    ops.map((op) => `f.${field}.${op}`);

  test("contains and match round-trip, and a default match is not written", () => {
    const params = encodeQuery(DEF, query);
    expect(params.get("f.note.contains")).toBe("gift wrap");
    expect(params.get("match")).toBe("any");
    expect(decodeQuery(DEF, params)).toEqual(query);
    expect(encodeQuery(DEF, OPEN).has("match")).toBe(false);
    expect(listQueryKeys(CAPABILITIES).map((key) => key.name)).toEqual([
      ...keysOf("number", COMPARE_OPS),
      ...keysOf("created_at", COMPARE_OPS),
      ...keysOf("total", COMPARE_OPS),
      "f.status.any_of",
      "f.region.any_of",
      ...keysOf("name", TEXT_OPS),
      ...keysOf("note", [...TEXT_OPS, "blank", "not_blank"]),
      "match",
      "group",
      "q",
      "sort",
      "cursor",
    ]);
  });

  test("contains takes text on a text field only", () => {
    expect(validateQueryValues(DEF, query)).toBeNull();
    for (const value of ["  ", "x".repeat(81)]) {
      expect(
        validateQueryValues(DEF, {
          ...BASE,
          filters: [{ field: "note", op: "contains", value }],
        }),
      ).toEqual({ code: "invalid_value", params: { field: "note" } });
    }
    for (const filter of [
      { field: "total", op: "contains", value: "12" },
      { field: "status", op: "contains", value: "open" },
    ] as Filter[]) {
      expect(validateQueryValues(DEF, { ...BASE, filters: [filter] })).toEqual({
        code: "invalid_op",
        params: { field: filter.field, op: "contains" },
      });
    }
    expect(
      validateQueryValues(DEF, {
        ...BASE,
        filters: [{ field: "nope", op: "contains", value: "x" }],
      })?.code,
    ).toBe("unknown_field");
  });

  test("contains and match any each get a chip that clears them", () => {
    const chips = listFilterChips(DEF, query);
    expect(chips.map((chip) => chip.id)).toEqual([
      "filter:status:any_of",
      "filter:total:between",
      "filter:created_at:greater_or_equal",
      "filter:note:contains",
      "combine",
      "sort",
    ]);
    expect(
      chips.find((chip) => chip.kind === "filter" && chip.field === "note"),
    ).toMatchObject({
      field: "note",
      op: "contains",
      operands: ["gift wrap"],
      clear: { type: "removeFilter", field: "note", at: 0 },
    });
    expect(chips.find((chip) => chip.kind === "combine")?.clear).toEqual({
      type: "setCombine",
      combine: "and",
    });
    expect(
      listFilterChips(DEF, { ...OPEN, combine: "or" }).some(
        (chip) => chip.kind === "combine",
      ),
    ).toBe(false);
  });
});

describe("the in-memory source takes all three with no limit", () => {
  const rows: GridRow[] = [
    { id: "a", status: "open", region: "north", total: 100, note: "Gift wrap" },
    { id: "b", status: "done", region: "north", total: 500, note: null },
    { id: "c", status: "done", region: "south", total: 900, note: "fragile" },
    { id: "d", status: "open", region: "south", total: 50, note: "a gift" },
  ];
  const source = createMemorySource(TEST_DEF, rows);
  const ids = async (query: Partial<QueryState>) => {
    const page = await source.fetchPage(
      { ...BASE, sort: { field: "name", direction: "asc" }, ...query },
      10,
      signal,
    );
    return page.rows.map((row) => row.id).sort();
  };

  test("contains ignores case and skips empty values", async () => {
    expect(
      await ids({
        filters: [{ field: "note", op: "contains", value: "GIFT" }],
      }),
    ).toEqual(["a", "d"]);
  });

  test("match any is the union across fields; match all the intersection", async () => {
    const filters: Filter[] = [
      STATUS_OPEN,
      { field: "total", op: "greater_or_equal", value: "800" },
    ];
    expect(await ids({ filters })).toEqual([]);
    expect(await ids({ filters, combine: "or" })).toEqual(["a", "c", "d"]);
    expect(
      await ids({
        filters: [
          ...filters,
          { field: "note", op: "contains", value: "fragile" },
        ],
        combine: "or",
        search: null,
      }),
    ).toEqual(["a", "c", "d"]);
  });

  test("two ranges and a contains combine, and nothing is gated", async () => {
    expect(
      await ids({
        filters: [
          { field: "total", op: "greater_or_equal", value: "60" },
          { field: "number", op: "less_or_equal", value: "5000" },
        ],
      }),
    ).toEqual([]);
    const context: OfferContext = {
      capabilities: source.capabilities,
      allSearchMatchesLoaded: false,
    };
    const offers = listOffers(TEST_DEF, BASE, context);
    expect(offers.combineOr).toBe(true);
    expect(listOfferedFields(offers, "contains")).toEqual(["name", "note"]);
    expect(source.capabilities.narrowLimited).toBe(false);
    expect(await source.fetchNarrowed(BASE, signal)).toBeNull();
  });
});
