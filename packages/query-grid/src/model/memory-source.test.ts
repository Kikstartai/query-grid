import { describe, expect, test } from "bun:test";

import type { GridRow, QueryState } from "./field-types.ts";
import { TEST_DEF } from "./grid-def.fixture.ts";
import { createMemorySource } from "./memory-source.ts";
import { defaultQuery } from "./query-actions.ts";

const ROWS: GridRow[] = Array.from({ length: 40 }, (_, index) => ({
  id: `row-${String(index).padStart(2, "0")}`,
  number: 1000 + index,
  created_at: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
  total: (index + 1) * 100,
  status: index % 4 === 0 ? "done" : "open",
  region: index % 2 === 0 ? "north" : "south",
  name: index % 5 === 0 ? `Smith ${index}` : `Jones ${index}`,
  note: index % 10 === 0 ? "fragile" : null,
}));

const BASE = defaultQuery(TEST_DEF);
const signal = new AbortController().signal;
const source = createMemorySource(TEST_DEF, ROWS);

describe("the in-memory source", () => {
  test("it filters, sorts and pages", async () => {
    const query: QueryState = {
      ...BASE,
      equals: { status: ["open"], region: ["south"] },
      range: { field: "total", min: "500", max: "2000" },
      sort: { field: "total", direction: "desc" },
    };
    const first = await source.fetchPage(query, 3, signal);
    expect(first.rows.map((row) => row.total)).toEqual([2000, 1800, 1600]);
    expect(first.hasNext).toBe(true);
    const second = await source.fetchPage(
      { ...query, cursor: first.nextCursor },
      3,
      signal,
    );
    expect(second.rows.map((row) => row.total)).toEqual([1400, 1200, 1000]);
  });

  test("nulls sort last and ties break on the key", async () => {
    const page = await source.fetchPage(
      { ...BASE, sort: { field: "note", direction: "asc" } },
      5,
      signal,
    );
    expect(page.rows.map((row) => row.id)).toEqual([
      "row-00",
      "row-10",
      "row-20",
      "row-30",
      "row-01",
    ]);
  });

  test("the search matches across its columns", async () => {
    const byName = await source.fetchCount(
      { ...BASE, search: "SMITH" },
      false,
      signal,
    );
    expect(byName).toEqual({ count: 8, capped: false, source: "exact" });
    const byNumber = await source.fetchPage(
      { ...BASE, search: "1017" },
      10,
      signal,
    );
    expect(byNumber.rows.map((row) => row.id)).toEqual(["row-17"]);
    const across = await source.fetchCount(
      { ...BASE, search: "5 1005" },
      false,
      signal,
    );
    expect(across.count).toBe(1);
  });

  test("each total is the sum of the filtered rows", async () => {
    const totals = await source.fetchTotals(
      { ...BASE, equals: { status: ["done"] } },
      signal,
    );
    const done = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36];
    expect(totals).toEqual([
      {
        field: "total",
        available: true,
        sum: done.reduce((sum, index) => sum + (index + 1) * 100, 0),
        rows: 10,
        source: "live",
      },
      {
        field: "number",
        available: true,
        sum: done.reduce((sum, index) => sum + 1000 + index, 0),
        rows: 10,
        source: "live",
      },
    ]);
  });

  test("facet counts follow the other filters, not the facet itself", async () => {
    const facets = await source.fetchFacets(
      { ...BASE, equals: { status: ["done"], region: ["north"] } },
      signal,
    );
    expect(
      Object.fromEntries(facets.map((facet) => [facet.value, facet.count])),
    ).toEqual({ done: 10, open: 10 });
    const done = facets.find((facet) => facet.value === "done");
    const rows = ROWS.filter(
      (row) => row.status === "done" && row.region === "north",
    );
    expect(done?.sums).toEqual({
      total: rows.reduce((sum, row) => sum + Number(row.total), 0),
      number: rows.reduce((sum, row) => sum + Number(row.number), 0),
    });
  });

  test("several values of one field match any of them", async () => {
    const either = await source.fetchCount(
      { ...BASE, equals: { status: ["open", "done"], region: ["north"] } },
      false,
      signal,
    );
    expect(either.count).toBe(20);
    const facets = await source.fetchFacets(
      { ...BASE, equals: { status: ["open", "done"] } },
      signal,
    );
    expect(facets.reduce((sum, facet) => sum + facet.count, 0)).toBe(40);
  });

  test("a grid without totals answers none", async () => {
    const bare = createMemorySource({ ...TEST_DEF, totals: undefined }, ROWS);
    expect(await bare.fetchTotals(BASE, signal)).toEqual([]);
  });

  test("a status change is kept", async () => {
    const mutable = createMemorySource(TEST_DEF, ROWS);
    const updated = await mutable.changeFacetValue("row-01", "done");
    expect(updated.status).toBe("done");
    const count = await mutable.fetchCount(
      { ...BASE, equals: { status: ["done"] } },
      false,
      signal,
    );
    expect(count.count).toBe(11);
    expect(await mutable.fetchTransitions(signal)).toEqual([
      ["open", "done"],
      ["done", "open"],
    ]);
  });

  test("options come from the def or from the rows", async () => {
    expect(
      await source.fetchOptions("status", { query: "do" }, signal),
    ).toEqual([{ value: "done", label: "Done" }]);
    const names = await source.fetchOptions(
      "name",
      { query: "smith 1" },
      signal,
    );
    expect(names.map((option) => option.value)).toEqual([
      "Smith 10",
      "Smith 15",
    ]);
  });
});
