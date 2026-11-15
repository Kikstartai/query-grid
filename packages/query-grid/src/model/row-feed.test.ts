import { describe, expect, test } from "bun:test";

import type { DataSource } from "./data-source.ts";
import type { RunnableQueries, GridRow, QueryState } from "./field-types.ts";
import {
  createTestSource,
  settle,
  TEST_DEF,
  TEST_SEARCH_FIELDS,
  UNTIERED,
} from "./grid-def.fixture.ts";
import { defaultQuery } from "./query-actions.ts";
import { createQueryStore } from "./query-store.ts";
import { createFeed } from "./row-feed.ts";
import { createCountStore } from "./summary-stores.ts";

const SERVER: RunnableQueries = {
  ...UNTIERED,
  holdsAllRows: false,
  searchIsOrdered: false,
  facetCountsFollowFilters: false,
  canRun: () => true,
  equalsFields: [],
  rangeFields: [],
  sortFields: ["created_at", "total"],
  searchFields: TEST_SEARCH_FIELDS,
  isFacetCountExact: () => true,
};

const ROWS: GridRow[] = [
  { id: "a", total: 300 },
  { id: "b", total: 100 },
  { id: "c", total: 200 },
];

interface Calls {
  pages: QueryState[];
  counts: boolean[];
}

function createSource(calls: Calls): DataSource {
  return createTestSource(SERVER, {
    fetchPage: async (query) => {
      calls.pages.push(query);
      return { rows: ROWS, nextCursor: null, hasNext: false };
    },
    fetchCount: async (_query, exact) => {
      calls.counts.push(exact);
      return { count: 3, capped: !exact, source: exact ? "exact" : "capped" };
    },
  });
}

describe("the row feed", () => {
  test("a query change after a finished search fetches one page, not two", async () => {
    const calls: Calls = { pages: [], counts: [] };
    const store = createQueryStore(TEST_DEF, SERVER, {
      ...defaultQuery(TEST_DEF),
      search: "abc",
    });
    const feed = createFeed(store, createSource(calls), 50);
    feed.subscribe(() => undefined);
    await settle();
    expect(calls.pages).toHaveLength(1);
    expect(store.getOfferContext().allSearchMatchesLoaded).toBe(true);
    store.dispatch({ type: "clearSearch" });
    await settle();
    expect(calls.pages).toHaveLength(2);
    expect(feed.getState().query.search).toBeNull();
  });

  test("a finished search re-sorts in place without a request", async () => {
    const calls: Calls = { pages: [], counts: [] };
    const store = createQueryStore(TEST_DEF, SERVER, {
      ...defaultQuery(TEST_DEF),
      search: "abc",
    });
    const feed = createFeed(store, createSource(calls), 50);
    feed.subscribe(() => undefined);
    await settle();
    store.dispatch({ type: "setSort", field: "total", direction: "asc" });
    await settle();
    expect(calls.pages).toHaveLength(1);
    expect(feed.getState().rows.map((row) => row.id)).toEqual(["b", "c", "a"]);
  });
});

describe("the count store on the shared resource", () => {
  test("it loads on the first subscriber, follows the filters, and refines to exact in place", async () => {
    const calls: Calls = { pages: [], counts: [] };
    const store = createQueryStore(TEST_DEF, SERVER, defaultQuery(TEST_DEF));
    const counts = createCountStore(store, createSource(calls));
    expect(calls.counts).toEqual([]);
    expect(counts.getState().loaded).toBe(false);
    counts.subscribe(() => undefined);
    await settle();
    expect(counts.getState().loaded).toBe(true);
    expect(counts.getState().result).toEqual({
      count: 3,
      capped: true,
      source: "capped",
    });
    store.dispatch({ type: "setSort", field: "total", direction: "asc" });
    await settle();
    expect(calls.counts).toEqual([false]);
    counts.requestExact();
    expect(counts.getState().result?.source).toBe("capped");
    await settle();
    expect(counts.getState().result?.source).toBe("exact");
    store.dispatch({ type: "setEquals", field: "status", values: ["open"] });
    expect(counts.getState().result).toBeNull();
    await settle();
    expect(calls.counts).toEqual([false, true, false]);
  });
});
