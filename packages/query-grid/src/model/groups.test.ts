import { describe, expect, test } from "bun:test";

import { listFilterChips } from "./chips.ts";
import type {
  GridRow,
  NarrowedState,
  OfferContext,
  QueryState,
} from "./field-types.ts";
import { EMPTY_VALUE } from "./field-values.ts";
import {
  createTestSource,
  settle,
  TEST_DEF,
  TEST_INDEXES,
} from "./grid-def.fixture.ts";
import { createGrouping, getGroupQuery, sortGroups } from "./groups.ts";
import { indexRunnable, type IndexedGridDef } from "./indexes.ts";
import { createMemorySource } from "./memory-source.ts";
import {
  applyAction,
  defaultQuery,
  explainUnavailable,
  listOffers,
} from "./query-actions.ts";
import { createQueryStore } from "./query-store.ts";
import { createFeed } from "./row-feed.ts";
import { decodeQuery, encodeQuery } from "./query-url.ts";
import type { GroupHeader } from "./wire-types.ts";

const DEF: IndexedGridDef = { ...TEST_DEF, indexes: TEST_INDEXES };
const BASE = defaultQuery(DEF);
const RUNNABLE = indexRunnable(TEST_INDEXES, {
  facetField: "status",
  searchFields: ["name", "number"],
  fields: DEF.fields,
});
const signal = new AbortController().signal;

function header(value: string, count: number): GroupHeader {
  return { value, label: null, count, capped: false, sums: null };
}

function contextFor(query: QueryState, over: boolean): OfferContext {
  const narrowed: NarrowedState = {
    limit: 1000,
    all: { rows: over ? 1000 : 40, over },
    any: null,
    allBasis: RUNNABLE.narrowBasis({ ...query, match: "all" }),
    anyBasis: RUNNABLE.narrowBasis({ ...query, match: "any" }),
  };
  return { runnable: RUNNABLE, allSearchMatchesLoaded: false, narrowed };
}

const ROWS: GridRow[] = Array.from({ length: 12 }, (_, index) => ({
  id: `row-${String(index).padStart(2, "0")}`,
  number: index,
  created_at: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
  total: (index + 1) * 100,
  status: index % 3 === 0 ? "done" : "open",
  region: index % 2 === 0 ? "north" : "south",
  name: `Name ${index}`,
  note: index % 4 === 0 ? null : "gift",
}));

describe("what may be grouped", () => {
  test("the equality fields group, and a bare id does not", () => {
    expect(RUNNABLE.groupFields).toEqual(["status", "region"]);
    expect(createMemorySource(TEST_DEF, []).runnable.groupFields).toEqual([
      "status",
      "region",
      "name",
      "note",
    ]);
    expect(indexRunnable(TEST_INDEXES).groupFields).toEqual([]);
  });

  test("the counted field groups at any size; another field only over a narrowed set", () => {
    const over = contextFor(BASE, true);
    expect(listOffers(DEF, BASE, over).groups).toEqual(["status"]);
    expect(
      explainUnavailable(BASE, { kind: "group", field: "region" }, over),
    ).toMatchObject({ code: "narrow_first", field: "region", rows: 1000 });
    expect(listOffers(DEF, BASE, contextFor(BASE, false)).groups).toEqual([
      "status",
      "region",
    ]);
    expect(RUNNABLE.isNarrowed({ ...BASE, group: "region" })).toBe(true);
    expect(RUNNABLE.isNarrowed({ ...BASE, group: "status" })).toBe(false);
  });

  test("a group needs an index for the rows of one group, and never joins the search or match any", () => {
    const byTotal: QueryState = {
      ...BASE,
      sort: { field: "total", direction: "asc" },
    };
    expect(RUNNABLE.canRun({ ...byTotal, group: "status" })).toBe(true);
    expect(RUNNABLE.canRun({ ...byTotal, group: "region" })).toBe(false);
    expect(
      explainUnavailable(
        byTotal,
        { kind: "group", field: "region" },
        contextFor(byTotal, false),
      ).code,
    ).toBe("no_group_with");
    expect(RUNNABLE.canRun({ ...BASE, search: "abc", group: "status" })).toBe(
      false,
    );
    expect(
      RUNNABLE.canRun({
        ...BASE,
        match: "any",
        equals: { status: ["open"], region: ["north"] },
        group: "status",
      }),
    ).toBe(false);
    expect(RUNNABLE.canRun({ ...BASE, group: "name" })).toBe(false);
  });

  test("the action, the URL and the chip", () => {
    const context = contextFor(BASE, false);
    const grouped = applyAction(
      DEF,
      BASE,
      { type: "setGroup", field: "region" },
      context,
    );
    expect(grouped.group).toBe("region");
    const params = encodeQuery(DEF, grouped);
    expect(params.get("group")).toBe("region");
    expect(decodeQuery(DEF, params)).toEqual(grouped);
    expect(encodeQuery(DEF, BASE).has("group")).toBe(false);
    const chip = listFilterChips(DEF, grouped).find(
      (item) => item.kind === "group",
    );
    expect(chip).toEqual({
      id: "group",
      kind: "group",
      field: "region",
      clear: { type: "setGroup", field: null },
    });
    expect(
      applyAction(DEF, grouped, { type: "setGroup", field: null }, context)
        .group,
    ).toBeNull();
  });
});

describe("the query of one group", () => {
  test("it is the query with that value and no group", () => {
    const query: QueryState = {
      ...BASE,
      group: "region",
      equals: { status: ["open"] },
    };
    expect(getGroupQuery(query, "north")).toEqual({
      ...query,
      group: null,
      equals: { status: ["open"], region: ["north"] },
    });
    expect(
      getGroupQuery(
        { ...query, equals: { region: ["north", "south"] } },
        "south",
      ).equals,
    ).toEqual({ region: ["south"] });
    expect(getGroupQuery(query, EMPTY_VALUE).equals.region).toEqual([
      EMPTY_VALUE,
    ]);
  });

  test("groups keep the order of the options, or the largest first", () => {
    expect(
      sortGroups(DEF, "status", [header("done", 9), header("open", 1)]).map(
        (group) => group.value,
      ),
    ).toEqual(["open", "done"]);
    expect(
      sortGroups(DEF, "name", [
        header("b", 2),
        header("a", 2),
        header("c", 7),
      ]).map((group) => group.value),
    ).toEqual(["c", "a", "b"]);
  });
});

describe("a grouping", () => {
  test("the headers load once, and a collapsed group loads no rows", async () => {
    const pages: QueryState[] = [];
    const source = createTestSource(RUNNABLE, {
      fetchGroups: async () => ({
        groups: [header("done", 4), header("open", 8)],
        source: "counter",
        truncated: false,
      }),
      fetchPage: async (query) => {
        pages.push(query);
        return {
          rows: ROWS.filter((row) =>
            query.equals.status.includes(String(row.status)),
          ).slice(0, 3),
          nextCursor: "next",
          hasNext: true,
        };
      },
    });
    const grouping = createGrouping(
      DEF,
      source,
      { ...BASE, group: "status" },
      3,
    );
    expect(grouping.getState().loaded).toBe(false);
    grouping.subscribe(() => undefined);
    await settle();
    const state = grouping.getState();
    expect(state).toMatchObject({ loaded: true, source: "counter" });
    expect(state.groups.map((group) => group.header.value)).toEqual([
      "open",
      "done",
    ]);
    expect(state.groups.every((group) => !group.expanded)).toBe(true);
    expect(pages).toEqual([]);

    grouping.toggle("done");
    expect(grouping.getState().groups[1]).toMatchObject({
      expanded: true,
      status: "loading",
    });
    await settle();
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      group: null,
      equals: { status: ["done"] },
      cursor: null,
    });
    const done = grouping.getState().groups[1];
    expect(done.rows.map((row) => row.status)).toEqual([
      "done",
      "done",
      "done",
    ]);
    expect(done.hasNext).toBe(true);
    expect(grouping.getState().groups[0].rows).toEqual([]);

    grouping.loadMore("done");
    await settle();
    expect(pages[1].cursor).toBe("next");
    expect(grouping.getState().groups[1].rows).toHaveLength(6);

    grouping.toggle("done");
    expect(grouping.getState().groups[1].expanded).toBe(false);
    grouping.toggle("done");
    await settle();
    expect(grouping.getState().groups[1]).toMatchObject({ expanded: true });
    expect(grouping.getState().groups[1].rows).toHaveLength(6);
    expect(pages).toHaveLength(2);
  });

  test("a failed header load is an error with its code", async () => {
    const source = createTestSource(RUNNABLE, {
      fetchGroups: async () => {
        throw new Error("down");
      },
    });
    const grouping = createGrouping(DEF, source, { ...BASE, group: "status" });
    grouping.subscribe(() => undefined);
    await settle();
    expect(grouping.getState()).toMatchObject({
      status: "error",
      error: { code: "request_failed" },
      groups: [],
    });
  });

  test("a group whose rows nothing answers says so and fetches nothing", async () => {
    let pages = 0;
    const source = createTestSource(RUNNABLE, {
      fetchGroups: async () => ({
        groups: [header("nowhere", 1)],
        source: "live",
        truncated: false,
      }),
      fetchPage: async () => {
        pages += 1;
        return { rows: [], nextCursor: null, hasNext: false };
      },
    });
    const grouping = createGrouping(DEF, source, { ...BASE, group: "region" });
    grouping.subscribe(() => undefined);
    await settle();
    grouping.toggle("nowhere");
    await settle();
    expect(grouping.getState().groups[0]).toMatchObject({
      expanded: true,
      status: "error",
      error: { code: "unindexed_query" },
    });
    expect(pages).toBe(0);
  });
});

describe("the in-memory source groups", () => {
  const source = createMemorySource(TEST_DEF, ROWS);

  test("by any equality field, with counts and sums, under the other filters", async () => {
    const result = await source.fetchGroups(
      { ...BASE, group: "region", equals: { status: ["open"] } },
      signal,
    );
    expect(result).toMatchObject({ source: "live", truncated: false });
    expect(result.groups).toEqual([
      {
        value: "north",
        label: null,
        count: 4,
        capped: false,
        sums: { total: 300 + 500 + 900 + 1100, number: 2 + 4 + 8 + 10 },
      },
      {
        value: "south",
        label: null,
        count: 4,
        capped: false,
        sums: { total: 200 + 600 + 800 + 1200, number: 1 + 5 + 7 + 11 },
      },
    ]);
  });

  test("an empty value is its own group, and its rows are the rows with no value", async () => {
    const result = await source.fetchGroups({ ...BASE, group: "note" }, signal);
    expect(result.groups.map((group) => [group.value, group.count])).toEqual([
      ["gift", 9],
      [EMPTY_VALUE, 3],
    ]);
    const page = await source.fetchPage(
      getGroupQuery({ ...BASE, group: "note" }, EMPTY_VALUE),
      20,
      signal,
    );
    expect(page.rows).toHaveLength(3);
    expect(page.rows.every((row) => row.note === null)).toBe(true);
  });

  test("a grouping over it pages each group on its own", async () => {
    const grouping = createGrouping(
      TEST_DEF,
      source,
      { ...BASE, group: "status", sort: { field: "total", direction: "asc" } },
      2,
    );
    grouping.subscribe(() => undefined);
    await settle();
    grouping.toggle("open");
    await settle();
    grouping.loadMore("open");
    await settle();
    const open = grouping.getState().groups[0];
    expect(open.header).toMatchObject({ value: "open", count: 8 });
    expect(open.rows.map((row) => row.total)).toEqual([200, 300, 500, 600]);
    expect(open.hasNext).toBe(true);
  });
});

describe("the main feed and a group change", () => {
  test("setting or clearing the group does not reload the rows", async () => {
    let pages = 0;
    const source = createTestSource(RUNNABLE, {
      fetchPage: async () => {
        pages += 1;
        return { rows: ROWS.slice(0, 2), nextCursor: null, hasNext: false };
      },
    });
    const store = createQueryStore(DEF, RUNNABLE, BASE);
    const feed = createFeed(store, source, 50);
    feed.subscribe(() => undefined);
    await settle();
    expect(pages).toBe(1);
    store.dispatch({ type: "setGroup", field: "status" });
    await settle();
    expect(pages).toBe(1);
    expect(feed.getState().query.group).toBe("status");
    store.dispatch({ type: "setEquals", field: "status", values: ["open"] });
    await settle();
    expect(pages).toBe(2);
  });
});
