import { describe, expect, test } from "bun:test";

import type { Filter, QueryState } from "./query-state.ts";
import {
  TEST_DEF,
  TEST_SEARCH_FIELDS,
  TEST_INDEXES,
} from "./grid-def.fixture.ts";
import { createHttpSource } from "./http-source.ts";
import { isQueryIndexed, getIndex, indexCapabilities } from "./indexes.ts";
import type { FilterOp } from "./operators.ts";
import { defaultQuery } from "./query-actions.ts";

const INDEXES = TEST_INDEXES;
const BASE: QueryState = defaultQuery(TEST_DEF);

describe("getIndex", () => {
  test("the equality set must match exactly", () => {
    expect(getIndex(INDEXES, BASE)).toEqual(INDEXES[0]);
    expect(
      getIndex(INDEXES, {
        ...BASE,
        filters: [
          { field: "status", op: "any_of", values: ["open"] },
          { field: "region", op: "any_of", values: ["north"] },
        ],
      }),
    ).toBeNull();
  });

  test("a range sits on the sort column of an index that allows it", () => {
    const range: Filter = {
      field: "created_at",
      op: "greater_or_equal",
      value: "2026-01-01",
    };
    expect(getIndex(INDEXES, { ...BASE, filters: [range] })).not.toBeNull();
    expect(
      getIndex(INDEXES, {
        ...BASE,
        filters: [{ field: "status", op: "any_of", values: ["open"] }, range],
      }),
    ).toBeNull();
    expect(
      getIndex(INDEXES, {
        ...BASE,
        sort: { field: "total", direction: "asc" },
        filters: [range],
      }),
    ).toBeNull();
  });

  test("several values of one field match the same index unless it opts out", () => {
    const several: QueryState = {
      ...BASE,
      filters: [{ field: "status", op: "any_of", values: ["open", "done"] }],
    };
    expect(getIndex(INDEXES, several)).toEqual(INDEXES[2]);
    const single = INDEXES.map((index) =>
      index.equals.includes("status") ? { ...index, multi: false } : index,
    );
    expect(getIndex(single, several)).toBeNull();
    expect(
      getIndex(single, {
        ...BASE,
        filters: [{ field: "status", op: "any_of", values: ["open"] }],
      }),
    ).not.toBeNull();
    expect(indexCapabilities(single).canRun(several)).toBe(false);
  });

  test("a search combines with equality filters on indexed fields, and with no range", () => {
    const search = { ...BASE, search: "abc" };
    expect(isQueryIndexed(INDEXES, TEST_SEARCH_FIELDS, search)).toBe(true);
    expect(isQueryIndexed(INDEXES, [], search)).toBe(false);
    expect(
      isQueryIndexed(INDEXES, TEST_SEARCH_FIELDS, {
        ...search,
        filters: [
          { field: "status", op: "any_of", values: ["open", "done"] },
          { field: "region", op: "any_of", values: ["north"] },
        ],
      }),
    ).toBe(true);
    expect(
      isQueryIndexed(INDEXES, TEST_SEARCH_FIELDS, {
        ...search,
        filters: [{ field: "name", op: "equals", value: "x" }],
      }),
    ).toBe(false);
    expect(
      isQueryIndexed(INDEXES, TEST_SEARCH_FIELDS, {
        ...search,
        filters: [
          { field: "created_at", op: "greater_or_equal", value: "2026-01-01" },
        ],
      }),
    ).toBe(false);
  });
});

describe("the HTTP source", () => {
  test("it builds its capabilities from the def's own indexes and facet", () => {
    const source = createHttpSource(
      { ...TEST_DEF, indexes: INDEXES },
      "/things",
    );
    expect(source.capabilities.holdsAllRows).toBe(false);
    expect(source.capabilities.sortFields).toEqual(["created_at", "total"]);
    expect(source.capabilities.isFacetCountExact(BASE)).toBe(true);
    expect(
      source.capabilities.canRun({
        ...BASE,
        filters: [{ field: "region", op: "any_of", values: ["north"] }],
        sort: { field: "total", direction: "asc" },
      }),
    ).toBe(false);
  });
});

describe("indexCapabilities", () => {
  const caps = indexCapabilities(INDEXES, {
    facetField: "status",
    searchFields: TEST_SEARCH_FIELDS,
  });

  test("they are the indexes, read once", () => {
    expect(caps.searchIsOrdered).toBe(false);
    const ranges: FilterOp[] = [
      "equals",
      "greater_than",
      "greater_or_equal",
      "less_than",
      "less_or_equal",
      "between",
    ];
    expect(caps.filterOps).toEqual({
      status: ["any_of"],
      region: ["any_of"],
      created_at: ranges,
      total: ranges,
    });
    expect(caps.sortFields).toEqual(["created_at", "total"]);
    expect(caps.searchFields).toEqual(["name", "number"]);
  });

  test("a query is answerable exactly when an index matches it", () => {
    const undeclared: QueryState = {
      ...BASE,
      filters: [{ field: "region", op: "any_of", values: ["north"] }],
      sort: { field: "total", direction: "asc" },
    };
    expect(caps.canRun(BASE)).toBe(true);
    expect(caps.canRun(undeclared)).toBe(false);
    expect(getIndex(INDEXES, undeclared)).toBeNull();
  });

  test("facet counts show only while the facet is the only filter", () => {
    expect(caps.isFacetCountExact(BASE)).toBe(true);
    expect(
      caps.isFacetCountExact({
        ...BASE,
        filters: [{ field: "status", op: "any_of", values: ["open"] }],
      }),
    ).toBe(true);
    expect(
      caps.isFacetCountExact({
        ...BASE,
        filters: [{ field: "region", op: "any_of", values: ["north"] }],
      }),
    ).toBe(false);
    expect(indexCapabilities(INDEXES).isFacetCountExact(BASE)).toBe(false);
  });
});
