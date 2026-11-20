import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setSystemTime,
  test,
} from "bun:test";

import { listFilterChips } from "./chips.ts";
import {
  DATE_PRESETS,
  resolveDatePreset,
  type DatePreset,
} from "./date-presets.ts";
import { canExpandNoneOf, expandNoneOf } from "./filter-values.ts";
import { getField, type BaseGridDef, type GridRow } from "./grid-def.ts";
import type { Filter, QueryState } from "./query-state.ts";
import { TEST_DEF, TEST_INDEXES } from "./grid-def.fixture.ts";
import { indexCapabilities } from "./indexes.ts";
import { createMemorySource } from "./memory-source.ts";
import { isLiteralOp, type FilterOp } from "./operators.ts";
import {
  applyAction,
  defaultQuery,
  listOffers,
  type Offers,
} from "./query-actions.ts";
import { toLiteralQuery, withLiteralFilters } from "./literal-filters.ts";
import { createQueryStore } from "./query-store.ts";
import { decodeQuery, encodeQuery } from "./query-url.ts";
import { checkFilterOps, validateQueryValues } from "./query-validate.ts";

const BASE = defaultQuery(TEST_DEF);
const STATUS = getField(TEST_DEF, "status")!;
const NAME = getField(TEST_DEF, "name")!;
const NOW = new Date(2026, 10, 15, 14, 30);
const signal = new AbortController().signal;

const WIDE: BaseGridDef = {
  ...TEST_DEF,
  fields: TEST_DEF.fields.map((field) =>
    field.key === "region"
      ? {
          ...field,
          nullable: true,
          options: [
            { value: "north", label: "North" },
            { value: "south", label: "South" },
            { value: "east", label: "East" },
          ],
        }
      : field,
  ),
};

const NOT_OPEN: Filter = { field: "status", op: "none_of", values: ["open"] };

function indexed(def: BaseGridDef, multi: boolean) {
  return withLiteralFilters(def, {
    ...createMemorySource(def, []),
    capabilities: indexCapabilities(
      TEST_INDEXES.map((index) => ({ ...index, multi })),
      { facetField: "status" },
    ),
  }).capabilities;
}

function listOfferedFields(offers: Offers, op: FilterOp): string[] {
  return Object.entries(offers.filters)
    .filter(([, ops]) => ops.some((offer) => offer.op === op && offer.offered))
    .map(([key]) => key);
}

describe("none of", () => {
  test("only a field with a fixed list of values is resolved in the browser", () => {
    expect(isLiteralOp(STATUS, "none_of")).toBe(true);
    expect(isLiteralOp(STATUS, "any_of")).toBe(false);
    expect(
      isLiteralOp(
        { ...STATUS, type: "boolean", options: undefined },
        "none_of",
      ),
    ).toBe(true);
    expect(isLiteralOp(NAME, "none_of")).toBe(false);
    expect(
      isLiteralOp(
        {
          key: "owner",
          label: "Owner",
          type: "id",
          lookup: { labelField: "name" },
        },
        "none_of",
      ),
    ).toBe(false);
    expect(
      isLiteralOp({ key: "tags", label: "Tags", type: "array" }, "none_of"),
    ).toBe(false);
  });

  test("it expands to the remaining values, and to blank on a nullable field", () => {
    expect(expandNoneOf(STATUS, NOT_OPEN)).toEqual({
      field: "status",
      op: "any_of",
      values: ["done"],
    });
    expect(
      expandNoneOf(getField(WIDE, "region")!, {
        field: "region",
        op: "none_of",
        values: ["north"],
      }),
    ).toEqual({
      field: "region",
      op: "any_of",
      values: ["south", "east", null],
    });
  });

  test("it is refused when nothing remains or more than the cap would", () => {
    const excluding = (values: string[]) =>
      ({ field: "status", op: "none_of", values }) as const;
    expect(canExpandNoneOf(STATUS, excluding(["open", "done"]))).toBe(false);
    expect(canExpandNoneOf({ ...STATUS, maxValues: 1 }, NOT_OPEN)).toBe(true);
    const many = {
      ...STATUS,
      maxValues: 2,
      options: ["a", "b", "c", "d"].map((value) => ({ value, label: value })),
    };
    expect(canExpandNoneOf(many, excluding(["a"]))).toBe(false);
    expect(canExpandNoneOf(many, excluding(["a", "b"]))).toBe(true);
  });

  test("the query keeps the intent, and the resolved query holds plain values", () => {
    const query: QueryState = { ...BASE, filters: [NOT_OPEN] };
    expect(toLiteralQuery(TEST_DEF, query, null).filters).toEqual([
      { field: "status", op: "any_of", values: ["done"] },
    ]);
    expect(toLiteralQuery(TEST_DEF, BASE, null)).toBe(BASE);
    expect(checkFilterOps(TEST_DEF, query)).toEqual({
      code: "literal_required",
      params: { field: "status", op: "none_of" },
    });
    const literal = toLiteralQuery(TEST_DEF, query, null);
    expect(checkFilterOps(TEST_DEF, literal)).toBeNull();
    expect(validateQueryValues(TEST_DEF, literal)).toBeNull();
  });

  test("the URL keeps the intent and a new option joins the expansion", () => {
    const query: QueryState = { ...BASE, filters: [NOT_OPEN] };
    const params = encodeQuery(TEST_DEF, query);
    expect(params.getAll("f.status.none_of")).toEqual(["open"]);
    const decoded = decodeQuery(TEST_DEF, params);
    expect(decoded.filters).toEqual([NOT_OPEN]);
    const grown: BaseGridDef = {
      ...TEST_DEF,
      fields: TEST_DEF.fields.map((field) =>
        field.key === "status"
          ? {
              ...field,
              options: [
                ...(field.options ?? []),
                { value: "held", label: "Held" },
              ],
            }
          : field,
      ),
    };
    expect(toLiteralQuery(grown, decoded, null).filters).toEqual([
      { field: "status", op: "any_of", values: ["done", "held"] },
    ]);
  });

  test("it is offered where the remaining values run, and the store keeps the intent", () => {
    const capabilities = indexed(TEST_DEF, true);
    const context = { capabilities, allSearchMatchesLoaded: false };
    expect(
      listOfferedFields(listOffers(TEST_DEF, BASE, context), "none_of"),
    ).toEqual(["status", "region"]);
    expect(
      listOfferedFields(
        listOffers(WIDE, BASE, {
          capabilities: indexed(WIDE, false),
          allSearchMatchesLoaded: false,
        }),
        "none_of",
      ),
    ).toEqual(["status"]);
    const store = createQueryStore(TEST_DEF, capabilities, BASE);
    store.dispatch({ type: "setFilter", filter: NOT_OPEN });
    expect(store.getQuery().filters).toEqual([NOT_OPEN]);
    store.dispatch({
      type: "setFilter",
      filter: { field: "status", op: "none_of", values: ["open", "done"] },
    });
    expect(store.getQuery().filters).toEqual([NOT_OPEN]);
  });

  test("the chip names the excluded values and removes one by its value", () => {
    const [chip] = listFilterChips(TEST_DEF, { ...BASE, filters: [NOT_OPEN] });
    expect(chip).toMatchObject({
      id: "filter:status:none_of",
      kind: "filter",
      op: "none_of",
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
      ],
    });
  });

  test("the in-memory source answers the remaining values", async () => {
    const rows: GridRow[] = [
      { id: "a", status: "open" },
      { id: "b", status: "done" },
    ];
    const source = createMemorySource(TEST_DEF, rows);
    const page = await source.fetchPage(
      { ...BASE, filters: [NOT_OPEN] },
      10,
      signal,
    );
    expect(page.rows.map((row) => row.id)).toEqual(["b"]);
  });
});

describe("date presets", () => {
  beforeEach(() => {
    setSystemTime(NOW);
  });

  afterEach(() => {
    setSystemTime();
  });

  const local = (iso: string) => new Date(iso);
  const endOf = (afterLast: Date) => afterLast.getTime() - 1;
  const inPeriod = (field: string, preset: DatePreset): Filter => ({
    field,
    op: "in_period",
    preset,
  });

  test("each preset is whole days where the viewer is, both ends included", () => {
    const today = resolveDatePreset("today", NOW);
    expect(local(today.min)).toEqual(new Date(2026, 10, 15));
    expect(local(today.max).getTime()).toBe(endOf(new Date(2026, 10, 16)));
    expect(today.max).toEndWith(".999999Z");
    const week = resolveDatePreset("last-7-days", NOW);
    expect(local(week.min)).toEqual(new Date(2026, 10, 9));
    expect(week.max).toBe(today.max);
    const yesterday = resolveDatePreset("yesterday", NOW);
    expect(local(yesterday.min)).toEqual(new Date(2026, 10, 14));
    expect(local(yesterday.max).getTime()).toBe(endOf(new Date(2026, 10, 15)));
    expect(local(resolveDatePreset("last-30-days", NOW).min)).toEqual(
      new Date(2026, 9, 17),
    );
    const month = resolveDatePreset("this-month", NOW);
    expect(local(month.min)).toEqual(new Date(2026, 10, 1));
    expect(local(month.max).getTime()).toBe(endOf(new Date(2026, 11, 1)));
    const lastMonth = resolveDatePreset("last-month", NOW);
    expect(local(lastMonth.min)).toEqual(new Date(2026, 9, 1));
    expect(local(lastMonth.max).getTime()).toBe(endOf(new Date(2026, 10, 1)));
    const year = resolveDatePreset("this-year", NOW);
    expect(local(year.min)).toEqual(new Date(2026, 0, 1));
    expect(local(year.max).getTime()).toBe(endOf(new Date(2027, 0, 1)));
  });

  test("last month in January is December of the year before", () => {
    const bounds = resolveDatePreset("last-month", new Date(2026, 0, 10));
    expect(local(bounds.min)).toEqual(new Date(2025, 11, 1));
  });

  test("the URL stores the name and the bounds are resolved when the query runs", () => {
    for (const preset of DATE_PRESETS) {
      const query: QueryState = {
        ...BASE,
        filters: [inPeriod("created_at", preset)],
      };
      const params = encodeQuery(TEST_DEF, query);
      expect(params.get("f.created_at.in_period")).toBe(preset);
      expect(decodeQuery(TEST_DEF, params).filters).toEqual(query.filters);
      const literal = toLiteralQuery(TEST_DEF, query, NOW);
      expect(literal.filters).toEqual([
        {
          field: "created_at",
          op: "between",
          ...resolveDatePreset(preset, NOW),
        },
      ]);
      expect(checkFilterOps(TEST_DEF, query)).toEqual({
        code: "literal_required",
        params: { field: "created_at", op: "in_period" },
      });
      expect(checkFilterOps(TEST_DEF, literal)).toBeNull();
      expect(validateQueryValues(TEST_DEF, literal)).toBeNull();
    }
  });

  test("an unknown period name is dropped from the URL", () => {
    expect(
      decodeQuery(TEST_DEF, new URLSearchParams("f.created_at.in_period=soon"))
        .filters,
    ).toEqual([]);
    expect(
      decodeQuery(TEST_DEF, new URLSearchParams("f.total.greater_or_equal=5"))
        .filters,
    ).toEqual([{ field: "total", op: "greater_or_equal", value: "5" }]);
  });

  test("a period on a field that is no date is never resolved", () => {
    const onTotal: QueryState = {
      ...BASE,
      filters: [inPeriod("total", "today")],
    };
    expect(toLiteralQuery(TEST_DEF, onTotal, NOW).filters).toEqual(
      onTotal.filters,
    );
    expect(validateQueryValues(TEST_DEF, onTotal)).toEqual({
      code: "invalid_op",
      params: { field: "total", op: "in_period" },
    });
  });

  test("the action sets a preset, the chip carries its name, and the source resolves it at fetch time", async () => {
    const rows: GridRow[] = [
      { id: "old", created_at: new Date(2026, 10, 1, 9).toISOString() },
      { id: "new", created_at: new Date(2026, 10, 12, 9).toISOString() },
    ];
    const source = createMemorySource(TEST_DEF, rows);
    const context = {
      capabilities: source.capabilities,
      allSearchMatchesLoaded: false,
    };
    const query = applyAction(
      TEST_DEF,
      BASE,
      { type: "setFilter", filter: inPeriod("created_at", "last-7-days") },
      context,
    );
    expect(query.filters).toEqual([inPeriod("created_at", "last-7-days")]);
    const chip = listFilterChips(TEST_DEF, query).find(
      (item) => item.kind === "filter",
    );
    expect(chip).toMatchObject({
      op: "in_period",
      preset: "last-7-days",
      operands: [],
    });
    const page = await source.fetchPage(query, 10, signal);
    expect(page.rows.map((row) => row.id)).toEqual(["new"]);
    const month = await source.fetchCount(
      { ...query, filters: [inPeriod("created_at", "this-month")] },
      false,
      signal,
    );
    expect(month.count).toBe(2);
  });

  test("the resolved parts keep their identity from one fetch to the next", async () => {
    const seen: QueryState[] = [];
    const inner = createMemorySource(TEST_DEF, []);
    const source = withLiteralFilters(TEST_DEF, {
      ...inner,
      fetchPage: async (query) => {
        seen.push(query);
        return { rows: [], nextCursor: null, hasNext: false };
      },
    });
    const query: QueryState = {
      ...BASE,
      filters: [NOT_OPEN, inPeriod("created_at", "today")],
    };
    await source.fetchPage(query, 10, signal);
    await source.fetchPage({ ...query, cursor: "10" }, 10, signal);
    expect(seen[0].filters).toBe(seen[1].filters);
    expect(seen[0].filters.map((filter) => filter.op)).toEqual([
      "any_of",
      "between",
    ]);
    expect(seen[1].cursor).toBe("10");
    await source.fetchPage(BASE, 10, signal);
    expect(seen[2]).toBe(BASE);
  });
});

describe("several bound filters", () => {
  const source = createMemorySource(TEST_DEF, []);
  const context = {
    capabilities: source.capabilities,
    allSearchMatchesLoaded: false,
  };

  test("a bound filter is set per field and cleared per field", () => {
    const one = applyAction(
      TEST_DEF,
      BASE,
      {
        type: "setFilter",
        filter: { field: "total", op: "between", min: "1", max: "9" },
      },
      context,
    );
    const two = applyAction(
      TEST_DEF,
      one,
      {
        type: "setFilter",
        filter: { field: "number", op: "greater_or_equal", value: "5" },
      },
      context,
    );
    expect(two.filters.map((filter) => filter.field)).toEqual([
      "total",
      "number",
    ]);
    const replaced = applyAction(
      TEST_DEF,
      two,
      {
        type: "setFilter",
        filter: { field: "total", op: "greater_or_equal", value: "2" },
      },
      context,
    );
    expect(replaced.filters).toEqual([
      { field: "total", op: "greater_or_equal", value: "2" },
      { field: "number", op: "greater_or_equal", value: "5" },
    ]);
    const cleared = applyAction(
      TEST_DEF,
      two,
      { type: "removeFilter", field: "total" },
      context,
    );
    expect(cleared.filters.map((filter) => filter.field)).toEqual(["number"]);
    expect(
      applyAction(
        TEST_DEF,
        cleared,
        { type: "removeFilter", field: "number" },
        context,
      ).filters,
    ).toEqual([]);
  });

  test("an index-backed source takes one bound filter, on its sort", () => {
    const capabilities = indexCapabilities(TEST_INDEXES);
    const server = { capabilities, allSearchMatchesLoaded: false };
    const byTotal: QueryState = {
      ...BASE,
      sort: { field: "total", direction: "asc" },
      filters: [{ field: "total", op: "greater_or_equal", value: "1" }],
    };
    expect(capabilities.canRun(byTotal)).toBe(true);
    expect(
      capabilities.canRun({
        ...byTotal,
        filters: [
          ...byTotal.filters,
          { field: "created_at", op: "greater_or_equal", value: "2026-01-01" },
        ],
      }),
    ).toBe(false);
    const next = applyAction(
      TEST_DEF,
      byTotal,
      {
        type: "setFilter",
        filter: { field: "total", op: "greater_or_equal", value: "7" },
      },
      server,
    );
    expect(next.filters).toEqual([
      { field: "total", op: "greater_or_equal", value: "7" },
    ]);
  });

  test("the same field takes several filters, up to the cap", () => {
    const first: Filter = {
      field: "total",
      op: "greater_or_equal",
      value: "1",
    };
    const second: Filter = {
      field: "total",
      op: "not_between",
      min: "5",
      max: "9",
    };
    const both = applyAction(
      TEST_DEF,
      applyAction(
        TEST_DEF,
        BASE,
        { type: "setFilter", filter: first },
        context,
      ),
      { type: "setFilter", filter: second, at: 1 },
      context,
    );
    expect(both.filters).toEqual([first, second]);
    expect(validateQueryValues(TEST_DEF, both)).toBeNull();
    expect(
      validateQueryValues(TEST_DEF, {
        ...BASE,
        filters: Array.from({ length: 21 }, () => first),
      }),
    ).toEqual({ code: "too_many_filters", params: { max: 20 } });
  });
});
