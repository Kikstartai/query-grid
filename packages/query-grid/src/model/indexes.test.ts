import { describe, expect, test } from "bun:test";

import type { QueryState } from "./field-types.ts";
import {
  TEST_DEF,
  TEST_SEARCH_FIELDS,
  TEST_INDEXES,
} from "./grid-def.fixture.ts";
import { createHttpSource } from "./http-source.ts";
import { isQueryIndexed, getIndex, indexCapabilities } from "./indexes.ts";

const INDEXES = TEST_INDEXES;
const BASE: QueryState = {
  equals: {},
  range: null,
  search: null,
  sort: TEST_DEF.defaultSort,
  cursor: null,
};

describe("getIndex", () => {
  test("the equality set must match exactly", () => {
    expect(getIndex(INDEXES, BASE)).toEqual(INDEXES[0]);
    expect(
      getIndex(INDEXES, {
        ...BASE,
        equals: { status: ["open"], region: ["north"] },
      }),
    ).toBeNull();
  });

  test("a range sits on the sort column of an index that allows it", () => {
    const range = { field: "created_at", min: "2026-01-01", max: null };
    expect(getIndex(INDEXES, { ...BASE, range })).not.toBeNull();
    expect(
      getIndex(INDEXES, { ...BASE, equals: { status: ["open"] }, range }),
    ).toBeNull();
    expect(
      getIndex(INDEXES, {
        ...BASE,
        sort: { field: "total", direction: "asc" },
        range,
      }),
    ).toBeNull();
  });

  test("several values of one field match the same index unless it opts out", () => {
    const several = { ...BASE, equals: { status: ["open", "done"] } };
    expect(getIndex(INDEXES, several)).toEqual(INDEXES[2]);
    const single = INDEXES.map((index) =>
      index.equals.includes("status") ? { ...index, multi: false } : index,
    );
    expect(getIndex(single, several)).toBeNull();
    expect(
      getIndex(single, { ...BASE, equals: { status: ["open"] } }),
    ).not.toBeNull();
    expect(indexCapabilities(single).isAnswerable(several)).toBe(false);
  });

  test("a search combines with no other filter", () => {
    const search = { ...BASE, search: "abc" };
    expect(isQueryIndexed(INDEXES, TEST_SEARCH_FIELDS, search)).toBe(true);
    expect(isQueryIndexed(INDEXES, [], search)).toBe(false);
    expect(
      isQueryIndexed(INDEXES, TEST_SEARCH_FIELDS, {
        ...search,
        equals: { status: ["open"] },
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
    expect(source.capabilities.mode).toBe("server");
    expect(source.capabilities.sortFields).toEqual(["created_at", "total"]);
    expect(source.capabilities.isFacetCountShown(BASE)).toBe(true);
    expect(
      source.capabilities.isAnswerable({
        ...BASE,
        equals: { region: ["north"] },
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
    expect(caps.mode).toBe("server");
    expect(caps.equalsFields).toEqual(["status", "region"]);
    expect(caps.rangeFields).toEqual(["created_at", "total"]);
    expect(caps.sortFields).toEqual(["created_at", "total"]);
    expect(caps.searchFields).toEqual(["name", "number"]);
  });

  test("a query is answerable exactly when an index matches it", () => {
    const undeclared: QueryState = {
      ...BASE,
      equals: { region: ["north"] },
      sort: { field: "total", direction: "asc" },
    };
    expect(caps.isAnswerable(BASE)).toBe(true);
    expect(caps.isAnswerable(undeclared)).toBe(false);
    expect(getIndex(INDEXES, undeclared)).toBeNull();
  });

  test("facet counts show only while the facet is the only filter", () => {
    expect(caps.isFacetCountShown(BASE)).toBe(true);
    expect(
      caps.isFacetCountShown({ ...BASE, equals: { status: ["open"] } }),
    ).toBe(true);
    expect(
      caps.isFacetCountShown({ ...BASE, equals: { region: ["north"] } }),
    ).toBe(false);
    expect(indexCapabilities(INDEXES).isFacetCountShown(BASE)).toBe(false);
  });
});
