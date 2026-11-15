import { describe, expect, test } from "bun:test";

import { listFilterChips } from "./chips.ts";
import { DATE_PRESETS, resolveDatePreset } from "./date-presets.ts";
import {
  getField,
  type BaseGridDef,
  type GridRow,
  type QueryState,
} from "./field-types.ts";
import {
  canExpandEquals,
  EMPTY_VALUE,
  expandEquals,
  isExcluding,
  toExcludeValues,
} from "./field-values.ts";
import { TEST_DEF, TEST_INDEXES } from "./grid-def.fixture.ts";
import { indexRunnable } from "./indexes.ts";
import { createMemorySource } from "./memory-source.ts";
import { applyAction, defaultQuery, listOffers } from "./query-actions.ts";
import { resolveQuery, withQueryResolution } from "./query-resolve.ts";
import { createQueryStore } from "./query-store.ts";
import { decodeQuery, encodeQuery } from "./query-url.ts";
import { validateQueryValues } from "./query-validate.ts";

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

function indexed(def: BaseGridDef, multi: boolean) {
  return withQueryResolution(def, {
    ...createMemorySource(def, []),
    runnable: indexRunnable(
      TEST_INDEXES.map((index) => ({ ...index, multi })),
      { facetField: "status" },
    ),
  }).runnable;
}

describe("exclude", () => {
  test("only a field with a fixed list of values excludes", () => {
    expect(isExcluding(STATUS, ["!open"])).toBe(true);
    expect(isExcluding(STATUS, ["!open", "done"])).toBe(false);
    expect(isExcluding(STATUS, [])).toBe(false);
    expect(isExcluding(NAME, ["!open"])).toBe(false);
    expect(
      isExcluding({ ...STATUS, lookup: { labelField: "name" } }, ["!open"]),
    ).toBe(false);
  });

  test("it expands to the remaining values, and to empty on a nullable field", () => {
    expect(expandEquals(STATUS, ["!open"])).toEqual(["done"]);
    expect(expandEquals(STATUS, ["open"])).toEqual(["open"]);
    expect(expandEquals(getField(WIDE, "region")!, ["!north"])).toEqual([
      "south",
      "east",
      EMPTY_VALUE,
    ]);
  });

  test("it is refused when nothing remains or more than the cap would", () => {
    expect(canExpandEquals(STATUS, ["!open", "!done"])).toBe(false);
    expect(canExpandEquals({ ...STATUS, maxValues: 1 }, ["!open"])).toBe(true);
    const many = {
      ...STATUS,
      maxValues: 2,
      options: ["a", "b", "c", "d"].map((value) => ({ value, label: value })),
    };
    expect(canExpandEquals(many, ["!a"])).toBe(false);
    expect(canExpandEquals(many, ["!a", "!b"])).toBe(true);
  });

  test("the query keeps the intent, and the resolved query holds plain values", () => {
    const query: QueryState = { ...BASE, equals: { status: ["!open"] } };
    expect(resolveQuery(TEST_DEF, query, null).equals).toEqual({
      status: ["done"],
    });
    expect(resolveQuery(TEST_DEF, BASE, null)).toBe(BASE);
    expect(validateQueryValues(TEST_DEF, query)).toEqual({
      code: "invalid_value",
      params: { field: "status" },
    });
    expect(
      validateQueryValues(TEST_DEF, resolveQuery(TEST_DEF, query, null)),
    ).toBeNull();
  });

  test("the URL keeps the intent and a new option joins the expansion", () => {
    const query: QueryState = { ...BASE, equals: { status: ["!open"] } };
    const params = encodeQuery(TEST_DEF, query);
    expect(params.getAll("f.status")).toEqual(["!open"]);
    const decoded = decodeQuery(TEST_DEF, params);
    expect(decoded.equals).toEqual({ status: ["!open"] });
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
    expect(resolveQuery(grown, decoded, null).equals).toEqual({
      status: ["done", "held"],
    });
  });

  test("it is offered where the remaining values run, and the store keeps the intent", () => {
    const runnable = indexed(TEST_DEF, true);
    const context = { runnable, allSearchMatchesLoaded: false };
    expect(listOffers(TEST_DEF, BASE, context).exclude).toEqual([
      "status",
      "region",
    ]);
    expect(
      listOffers(WIDE, BASE, {
        runnable: indexed(WIDE, false),
        allSearchMatchesLoaded: false,
      }).exclude,
    ).toEqual(["status"]);
    const store = createQueryStore(TEST_DEF, runnable, BASE);
    store.dispatch({
      type: "setEquals",
      field: "status",
      values: toExcludeValues(["open"]),
    });
    expect(store.getQuery().equals).toEqual({ status: ["!open"] });
    store.dispatch({
      type: "setEquals",
      field: "status",
      values: toExcludeValues(["open", "done"]),
    });
    expect(store.getQuery().equals).toEqual({ status: ["!open"] });
  });

  test("the chip names the excluded values and removes one by its token", () => {
    const [chip] = listFilterChips(TEST_DEF, {
      ...BASE,
      equals: { status: ["!open"] },
    });
    expect(chip).toMatchObject({
      kind: "equals",
      excluded: true,
      values: [
        {
          value: "open",
          text: "Open",
          clear: { type: "removeEqualsValue", field: "status", value: "!open" },
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
      { ...BASE, equals: { status: ["!open"] } },
      10,
      signal,
    );
    expect(page.rows.map((row) => row.id)).toEqual(["b"]);
  });
});

describe("date presets", () => {
  const local = (iso: string) => new Date(iso);
  const endOf = (afterLast: Date) => afterLast.getTime() - 1;

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
        ranges: [{ field: "created_at", min: null, max: null, preset }],
      };
      const params = encodeQuery(TEST_DEF, query);
      expect(params.get("r.created_at")).toBe(preset);
      expect(decodeQuery(TEST_DEF, params).ranges).toEqual(query.ranges);
      const [range] = resolveQuery(TEST_DEF, query, NOW).ranges;
      expect(range).toEqual({
        field: "created_at",
        ...resolveDatePreset(preset, NOW),
      });
      expect(validateQueryValues(TEST_DEF, query)).not.toBeNull();
      expect(
        validateQueryValues(TEST_DEF, resolveQuery(TEST_DEF, query, NOW)),
      ).toBeNull();
    }
  });

  test("a preset on a field that is no date, or an unknown name, is never resolved", () => {
    const onTotal: QueryState = {
      ...BASE,
      ranges: [{ field: "total", min: null, max: null, preset: "today" }],
    };
    expect(resolveQuery(TEST_DEF, onTotal, NOW).ranges[0].preset).toBe("today");
    const unknown: QueryState = {
      ...BASE,
      ranges: [{ field: "created_at", min: null, max: null, preset: "soon" }],
    };
    expect(resolveQuery(TEST_DEF, unknown, NOW).ranges[0].preset).toBe("soon");
    expect(
      decodeQuery(TEST_DEF, new URLSearchParams("r.total=5")).ranges,
    ).toEqual([{ field: "total", min: "5", max: null }]);
  });

  test("the action sets a preset, the chip carries its name, and the source resolves it at fetch time", async () => {
    const rows: GridRow[] = [
      { id: "old", created_at: new Date(2026, 10, 1, 9).toISOString() },
      { id: "new", created_at: new Date(2026, 10, 12, 9).toISOString() },
    ];
    const source = createMemorySource(TEST_DEF, rows, { now: () => NOW });
    const context = {
      runnable: source.runnable,
      allSearchMatchesLoaded: false,
    };
    const query = applyAction(
      TEST_DEF,
      BASE,
      {
        type: "setRange",
        field: "created_at",
        min: null,
        max: null,
        preset: "last-7-days",
      },
      context,
    );
    expect(query.ranges).toEqual([
      { field: "created_at", min: null, max: null, preset: "last-7-days" },
    ]);
    const chip = listFilterChips(TEST_DEF, query).find(
      (item) => item.kind === "range",
    );
    expect(chip).toMatchObject({ preset: "last-7-days", min: null, max: null });
    const page = await source.fetchPage(query, 10, signal);
    expect(page.rows.map((row) => row.id)).toEqual(["new"]);
    const month = await source.fetchCount(
      {
        ...query,
        ranges: [
          { field: "created_at", min: null, max: null, preset: "this-month" },
        ],
      },
      false,
      signal,
    );
    expect(month.count).toBe(2);
  });

  test("the resolved parts keep their identity from one fetch to the next", async () => {
    const seen: QueryState[] = [];
    const inner = createMemorySource(TEST_DEF, []);
    const source = withQueryResolution(
      TEST_DEF,
      {
        ...inner,
        fetchPage: async (query) => {
          seen.push(query);
          return { rows: [], nextCursor: null, hasNext: false };
        },
      },
      { now: () => NOW },
    );
    const query: QueryState = {
      ...BASE,
      equals: { status: ["!open"] },
      ranges: [{ field: "created_at", min: null, max: null, preset: "today" }],
    };
    await source.fetchPage(query, 10, signal);
    await source.fetchPage({ ...query, cursor: "10" }, 10, signal);
    expect(seen[0].equals).toBe(seen[1].equals);
    expect(seen[0].ranges).toBe(seen[1].ranges);
    expect(seen[1].cursor).toBe("10");
    await source.fetchPage(BASE, 10, signal);
    expect(seen[2]).toBe(BASE);
  });
});

describe("several ranges", () => {
  const source = createMemorySource(TEST_DEF, []);
  const context = { runnable: source.runnable, allSearchMatchesLoaded: false };

  test("a range is set per field and cleared per field", () => {
    const one = applyAction(
      TEST_DEF,
      BASE,
      { type: "setRange", field: "total", min: "1", max: "9" },
      context,
    );
    const two = applyAction(
      TEST_DEF,
      one,
      { type: "setRange", field: "number", min: "5", max: null },
      context,
    );
    expect(two.ranges.map((range) => range.field)).toEqual(["total", "number"]);
    const replaced = applyAction(
      TEST_DEF,
      two,
      { type: "setRange", field: "total", min: "2", max: null },
      context,
    );
    expect(replaced.ranges).toEqual([
      { field: "number", min: "5", max: null },
      { field: "total", min: "2", max: null },
    ]);
    const cleared = applyAction(
      TEST_DEF,
      two,
      { type: "clearRange", field: "total" },
      context,
    );
    expect(cleared.ranges.map((range) => range.field)).toEqual(["number"]);
    expect(
      applyAction(TEST_DEF, two, { type: "clearRange" }, context).ranges,
    ).toEqual([]);
  });

  test("an index-backed source takes one range, on its sort", () => {
    const runnable = indexRunnable(TEST_INDEXES);
    const server = { runnable, allSearchMatchesLoaded: false };
    const byTotal: QueryState = {
      ...BASE,
      sort: { field: "total", direction: "asc" },
      ranges: [{ field: "total", min: "1", max: null }],
    };
    expect(runnable.canRun(byTotal)).toBe(true);
    expect(
      runnable.canRun({
        ...byTotal,
        ranges: [
          ...byTotal.ranges,
          { field: "created_at", min: "2026-01-01", max: null },
        ],
      }),
    ).toBe(false);
    const next = applyAction(
      TEST_DEF,
      byTotal,
      { type: "setRange", field: "total", min: "7", max: null },
      server,
    );
    expect(next.ranges).toEqual([{ field: "total", min: "7", max: null }]);
  });

  test("the same field twice is refused", () => {
    expect(
      validateQueryValues(TEST_DEF, {
        ...BASE,
        ranges: [
          { field: "total", min: "1", max: null },
          { field: "total", min: "2", max: null },
        ],
      }),
    ).toEqual({ code: "invalid_value", params: { field: "total" } });
  });
});
