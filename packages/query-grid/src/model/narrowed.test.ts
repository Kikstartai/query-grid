import { describe, expect, test } from "bun:test";

import { listFilterChips } from "./chips.ts";
import type {
  GridRow,
  NarrowedResult,
  NarrowedState,
  OfferContext,
  QueryState,
} from "./field-types.ts";
import {
  createTestSource,
  settle,
  TEST_DEF,
  TEST_INDEXES,
} from "./grid-def.fixture.ts";
import {
  indexCapabilities,
  isMatchAny,
  isQueryRunnable,
  planQuery,
  type IndexedGridDef,
} from "./indexes.ts";
import { createMemorySource } from "./memory-source.ts";
import {
  applyAction,
  defaultQuery,
  explainUnavailable,
  listOffers,
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
const OPEN: QueryState = { ...BASE, equals: { status: ["open"] } };
const TOTAL_RANGE = { field: "total", min: "100", max: "900" };
const CREATED_RANGE = { field: "created_at", min: "2026-01-01", max: null };
const signal = new AbortController().signal;

function narrowedFor(
  query: QueryState,
  result: Partial<NarrowedResult> = {},
): NarrowedState {
  return {
    limit: 1000,
    all: { rows: 40, over: false, capped: false },
    any: null,
    ...result,
    allBasis: CAPABILITIES.narrowBasis({ ...query, match: "all" }),
    anyBasis: CAPABILITIES.narrowBasis({ ...query, match: "any" }),
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

const UNKNOWN: OfferContext = {
  capabilities: CAPABILITIES,
  allSearchMatchesLoaded: false,
  narrowed: null,
};

describe("the plan of a query", () => {
  test("an indexed query is its own core and is not narrowed", () => {
    const plan = planQuery(TEST_INDEXES, OPEN);
    expect(plan).toEqual({ core: OPEN, narrowed: false, terms: null });
  });

  test("a range off the sort, a second range and a contains run over the core's rows", () => {
    const offSort = planQuery(TEST_INDEXES, { ...OPEN, ranges: [TOTAL_RANGE] });
    expect(offSort?.narrowed).toBe(true);
    expect(offSort?.core.ranges).toEqual([]);
    expect(offSort?.core.equals).toEqual({ status: ["open"] });
    const two = planQuery(TEST_INDEXES, {
      ...BASE,
      ranges: [CREATED_RANGE, TOTAL_RANGE],
    });
    expect(two?.narrowed).toBe(true);
    expect(two?.core.ranges).toEqual([CREATED_RANGE]);
    const contains = planQuery(TEST_INDEXES, {
      ...OPEN,
      contains: { field: "note", value: "gift" },
    });
    expect(contains).toMatchObject({ narrowed: true, terms: null });
    expect(contains?.core.contains).toBeNull();
  });

  test("a range on the sort of an index with no range falls into the narrowed part", () => {
    const plan = planQuery(TEST_INDEXES, { ...OPEN, ranges: [CREATED_RANGE] });
    expect(plan?.narrowed).toBe(true);
    expect(plan?.core.ranges).toEqual([]);
  });

  test("a query whose equality filters no index pairs has no plan", () => {
    expect(
      planQuery(TEST_INDEXES, {
        ...BASE,
        equals: { status: ["open"], region: ["north"] },
        contains: { field: "note", value: "gift" },
      }),
    ).toBeNull();
  });

  test("match any needs two filters, and counts each one through its own index", () => {
    expect(isMatchAny({ ...OPEN, match: "any" })).toBe(false);
    expect(planQuery(TEST_INDEXES, { ...OPEN, match: "any" })?.narrowed).toBe(
      false,
    );
    const either: QueryState = {
      ...BASE,
      match: "any",
      equals: { status: ["open"], region: ["north"] },
      ranges: [TOTAL_RANGE],
    };
    const plan = planQuery(TEST_INDEXES, either);
    expect(plan?.narrowed).toBe(true);
    expect(plan?.terms?.map((term) => [term.equals, term.ranges])).toEqual([
      [{ status: ["open"] }, []],
      [{ region: ["north"] }, []],
      [{}, [TOTAL_RANGE]],
    ]);
    expect(plan?.terms?.map((term) => term.sort.field)).toEqual([
      "created_at",
      "created_at",
      "total",
    ]);
    expect(plan?.core.equals).toEqual({});
  });

  test("a term no index counts leaves the whole table as the set", () => {
    const plan = planQuery(TEST_INDEXES, {
      ...OPEN,
      match: "any",
      contains: { field: "note", value: "gift" },
    });
    expect(plan).toMatchObject({ narrowed: true, terms: null });
  });

  test("the server's rule: any range field and any text field, and never beside the search", () => {
    const ranged = { ...OPEN, ranges: [TOTAL_RANGE] };
    expect(isQueryRunnable(DEF, ranged)).toBe(true);
    expect(CAPABILITIES.canRun(ranged)).toBe(true);
    expect(CAPABILITIES.isNarrowed(ranged)).toBe(true);
    expect(CAPABILITIES.isNarrowed(OPEN)).toBe(false);
    expect(
      isQueryRunnable(DEF, {
        ...OPEN,
        contains: { field: "status", value: "op" },
      }),
    ).toBe(false);
    expect(
      isQueryRunnable(DEF, {
        ...BASE,
        search: "abc",
        contains: { field: "note", value: "gift" },
      }),
    ).toBe(false);
    expect(
      isQueryRunnable(DEF, {
        ...BASE,
        search: "abc",
        match: "any",
        equals: { status: ["open"], region: ["north"] },
      }),
    ).toBe(false);
    expect(CAPABILITIES.rangeFields).toEqual(["number", "created_at", "total"]);
    expect(CAPABILITIES.containsFields).toEqual(["name", "note"]);
    expect(indexCapabilities(TEST_INDEXES).containsFields).toEqual([]);
    expect(indexCapabilities(TEST_INDEXES).canRun(ranged)).toBe(false);
  });
});

describe("offers under the narrowed-set limit", () => {
  test("within the limit every expensive control is offered", () => {
    const offers = listOffers(DEF, OPEN, contextFor(OPEN));
    expect(offers.ranges).toEqual(["number", "created_at", "total"]);
    expect(offers.contains).toEqual(["name", "note"]);
  });

  test("over the limit only what the index answers is offered, with the size as the reason", () => {
    const base = contextFor(BASE, {
      all: { rows: 1000, over: true, capped: true },
    });
    const offers = listOffers(DEF, BASE, base);
    expect(offers.ranges).toEqual(["created_at"]);
    expect(offers.contains).toEqual([]);
    expect(
      explainUnavailable(BASE, { kind: "range", field: "total" }, base),
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
      explainUnavailable(BASE, { kind: "contains", field: "note" }, base).code,
    ).toBe("narrow_first");
    expect(
      applyAction(
        DEF,
        BASE,
        { type: "setContains", field: "note", value: "gift" },
        base,
      ),
    ).toBe(BASE);
  });

  test("before the size is known nothing expensive is offered", () => {
    const offers = listOffers(DEF, OPEN, UNKNOWN);
    expect(offers.ranges).toEqual([]);
    expect(offers.contains).toEqual([]);
    expect(
      explainUnavailable(OPEN, { kind: "contains", field: "note" }, UNKNOWN)
        .code,
    ).toBe("narrow_counting");
    const stale = contextFor(BASE);
    expect(listOffers(DEF, OPEN, stale).contains).toEqual([]);
  });

  test("match any is gated by the sum of its terms", () => {
    const two: QueryState = {
      ...BASE,
      equals: { status: ["open"], region: ["north"] },
    };
    const unpaired: OfferContext = {
      ...contextFor(two, { any: { rows: 70, over: false, capped: false } }),
    };
    expect(listOffers(DEF, two, unpaired).matchAny).toBe(true);
    expect(
      applyAction(DEF, two, { type: "setMatch", mode: "any" }, unpaired).match,
    ).toBe("any");
    const over = contextFor(two, {
      any: { rows: 4000, over: true, capped: false },
    });
    expect(listOffers(DEF, two, over).matchAny).toBe(false);
    expect(explainUnavailable(two, { kind: "match" }, over)).toMatchObject({
      code: "narrow_first",
      rows: 4000,
      capped: false,
    });
    expect(listOffers(DEF, OPEN, contextFor(OPEN)).matchAny).toBe(true);
    const capped = contextFor(two, {
      any: { rows: 1800, over: true, capped: true },
    });
    expect(explainUnavailable(two, { kind: "match" }, capped)).toMatchObject({
      rows: 1800,
      capped: true,
      narrowBy: [],
    });
  });

  test("a query already over a narrowed set may change its filters: the server decides", () => {
    const narrowed: QueryState = {
      ...OPEN,
      contains: { field: "note", value: "gift" },
    };
    const context = contextFor(narrowed);
    const wider = applyAction(
      DEF,
      narrowed,
      { type: "clearEquals", field: "status" },
      context,
    );
    expect(wider.equals).toEqual({});
    expect(wider.contains).toEqual({ field: "note", value: "gift" });
    const plain = applyAction(
      DEF,
      OPEN,
      { type: "clearEquals", field: "status" },
      context,
    );
    expect(plain.equals).toEqual({});
  });

  test("the search and the expensive controls exclude each other", () => {
    const searching: QueryState = { ...BASE, search: "abc" };
    const context = contextFor(searching);
    const offers = listOffers(DEF, searching, context);
    expect(offers.contains).toEqual([]);
    expect(offers.ranges).toEqual([]);
    expect(
      explainUnavailable(
        searching,
        { kind: "contains", field: "note" },
        context,
      ).code,
    ).toBe("search_no_combine");
    const narrowed: QueryState = {
      ...OPEN,
      contains: { field: "note", value: "gift" },
    };
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
    expect(wrapped.narrowBasis({ ...OPEN, ranges: [TOTAL_RANGE] })).toBe(basis);
    expect(
      wrapped.narrowBasis({
        ...OPEN,
        ranges: [
          { field: "total", min: null, max: null, preset: "today" },
          { field: "number", min: "1", max: null },
        ],
        contains: { field: "note", value: "gift" },
      }),
    ).toBe(basis);
    expect(wrapped.narrowBasis(BASE)).not.toBe(basis);
  });

  test("a preset on the indexed range is part of the basis, by its name", () => {
    const preset = (name: string): QueryState => ({
      ...BASE,
      ranges: [{ field: "created_at", min: null, max: null, preset: name }],
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
          all: { rows: asked.length, over: false, capped: false },
          any: null,
        };
      },
    });
    const store = createQueryStore(DEF, CAPABILITIES, BASE);
    const narrowed = createNarrowedStore(store, source);
    expect(store.getOfferContext().narrowed).toBeNull();
    narrowed.connect();
    await settle();
    expect(store.getOfferContext().narrowed).toMatchObject({
      all: { rows: 1, over: false, capped: false },
      allBasis: CAPABILITIES.narrowBasis(BASE),
    });
    expect(listOffers(DEF, BASE, store.getOfferContext()).contains).toEqual([
      "name",
      "note",
    ]);
    store.dispatch({ type: "setEquals", field: "status", values: ["open"] });
    expect(
      listOffers(DEF, store.getQuery(), store.getOfferContext()).contains,
    ).toEqual([]);
    await settle();
    expect(asked).toHaveLength(2);
    expect(
      listOffers(DEF, store.getQuery(), store.getOfferContext()).contains,
    ).toEqual(["name", "note"]);
    store.dispatch({ type: "setSort", field: "total", direction: "asc" });
    await settle();
    expect(asked).toHaveLength(2);
  });
});

describe("the URL, validation and chips", () => {
  const query: QueryState = {
    ...BASE,
    match: "any",
    equals: { status: ["open"] },
    ranges: [TOTAL_RANGE, CREATED_RANGE],
    contains: { field: "note", value: "gift wrap" },
  };

  test("contains and match round-trip, and a default match is not written", () => {
    const params = encodeQuery(DEF, query);
    expect(params.get("c.note")).toBe("gift wrap");
    expect(params.get("match")).toBe("any");
    expect(decodeQuery(DEF, params)).toEqual(query);
    expect(encodeQuery(DEF, OPEN).has("match")).toBe(false);
    expect(listQueryKeys(CAPABILITIES).map((key) => key.name)).toEqual([
      "f.status",
      "f.region",
      "r.number",
      "r.created_at",
      "r.total",
      "c.name",
      "c.note",
      "match",
      "group",
      "q",
      "sort",
      "cursor",
    ]);
  });

  test("contains takes text on a text field only", () => {
    expect(validateQueryValues(DEF, query)).toBeNull();
    for (const contains of [
      { field: "note", value: "  " },
      { field: "note", value: "x".repeat(81) },
      { field: "total", value: "12" },
      { field: "status", value: "open" },
    ]) {
      expect(validateQueryValues(DEF, { ...BASE, contains })).toEqual({
        code: "invalid_value",
        params: { field: contains.field },
      });
    }
    expect(
      validateQueryValues(DEF, {
        ...BASE,
        contains: { field: "nope", value: "x" },
      })?.code,
    ).toBe("unknown_field");
  });

  test("contains and match any each get a chip that clears them", () => {
    const chips = listFilterChips(DEF, query);
    expect(chips.map((chip) => chip.id)).toEqual([
      "eq:status",
      "range:total",
      "range:created_at",
      "contains",
      "match",
      "sort",
    ]);
    expect(chips.find((chip) => chip.kind === "contains")).toMatchObject({
      field: "note",
      value: "gift wrap",
      clear: { type: "clearContains" },
    });
    expect(chips.find((chip) => chip.kind === "match")?.clear).toEqual({
      type: "setMatch",
      mode: "all",
    });
    expect(
      listFilterChips(DEF, { ...OPEN, match: "any" }).some(
        (chip) => chip.kind === "match",
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
    expect(await ids({ contains: { field: "note", value: "GIFT" } })).toEqual([
      "a",
      "d",
    ]);
  });

  test("match any is the union across fields; match all the intersection", async () => {
    const filters: Partial<QueryState> = {
      equals: { status: ["open"] },
      ranges: [{ field: "total", min: "800", max: null }],
    };
    expect(await ids(filters)).toEqual([]);
    expect(await ids({ ...filters, match: "any" })).toEqual(["a", "c", "d"]);
    expect(
      await ids({
        ...filters,
        match: "any",
        contains: { field: "note", value: "fragile" },
        search: null,
      }),
    ).toEqual(["a", "c", "d"]);
  });

  test("two ranges and a contains combine, and nothing is gated", async () => {
    expect(
      await ids({
        ranges: [
          { field: "total", min: "60", max: null },
          { field: "number", min: null, max: "5000" },
        ],
      }),
    ).toEqual([]);
    const context: OfferContext = {
      capabilities: source.capabilities,
      allSearchMatchesLoaded: false,
    };
    const offers = listOffers(TEST_DEF, BASE, context);
    expect(offers.matchAny).toBe(true);
    expect(offers.contains).toEqual(["name", "note"]);
    expect(source.capabilities.narrowLimited).toBe(false);
    expect(await source.fetchNarrowed(BASE, signal)).toBeNull();
  });
});
