import { describe, expect, test } from "bun:test";

import type { Filter, QueryState } from "./query-state.ts";
import { TEST_DEF, TEST_INDEXES } from "./grid-def.fixture.ts";
import { listSortIndexes, type IndexedGridDef } from "./grid-def.ts";
import { createHttpSource } from "./http-source.ts";
import {
  getIndex,
  gridDefCapabilities,
  indexId,
  isQueryIndexed,
  planQuery,
} from "./indexes.ts";
import { listIndexKinds, OPERATORS, type FilterOp } from "./operators.ts";
import { defaultQuery } from "./query-actions.ts";

const INDEXES = TEST_INDEXES;
const DEF: IndexedGridDef = { ...TEST_DEF, indexes: INDEXES };
const SORTS = listSortIndexes(INDEXES);
const BASE: QueryState = defaultQuery(TEST_DEF);

describe("getIndex", () => {
  test("the filter set must match exactly", () => {
    expect(getIndex(DEF, BASE)).toEqual(SORTS[0]);
    expect(
      getIndex(DEF, {
        ...BASE,
        filters: [
          { field: "status", op: "any_of", values: ["open"] },
          { field: "region", op: "any_of", values: ["north"] },
        ],
      }),
    ).toBeNull();
  });

  test("a range on a number or date sort is answered by every index on that sort, with no flag", () => {
    const range: Filter = {
      field: "created_at",
      op: "greater_or_equal",
      value: "2026-01-01",
    };
    expect(getIndex(DEF, { ...BASE, filters: [range] })).toEqual(SORTS[0]);
    expect(
      getIndex(DEF, {
        ...BASE,
        filters: [{ field: "status", op: "any_of", values: ["open"] }, range],
      }),
    ).toEqual(SORTS[2]);
    expect(
      getIndex(DEF, {
        ...BASE,
        sort: { field: "total", direction: "asc" },
        filters: [range],
      }),
    ).toBeNull();
  });

  test("a text sort is never a range", () => {
    const def: IndexedGridDef = {
      ...TEST_DEF,
      defaultSort: { field: "name", direction: "asc" },
      indexes: [{ filter: [], sort: ["name"] }],
    };
    const query: QueryState = {
      ...defaultQuery(def),
      filters: [{ field: "name", op: "equals", value: "abc" }],
    };
    expect(getIndex(def, defaultQuery(def))).toEqual({
      filter: [],
      sort: ["name"],
    });
    expect(getIndex(def, query)).toBeNull();
    expect(planQuery(def, query)?.narrowed).toBe(true);
  });

  test("any of always takes several values of one field on the same index", () => {
    const several: QueryState = {
      ...BASE,
      filters: [{ field: "status", op: "any_of", values: ["open", "done"] }],
    };
    expect(getIndex(DEF, several)).toEqual(SORTS[2]);
    expect(gridDefCapabilities(DEF).canRun(several)).toBe(true);
  });

  test("a search combines with equality filters on indexed fields, and with no range", () => {
    const search = { ...BASE, search: "abc" };
    expect(isQueryIndexed(DEF, search)).toBe(true);
    expect(isQueryIndexed({ ...DEF, search: [] }, search)).toBe(false);
    expect(
      isQueryIndexed(DEF, {
        ...search,
        filters: [
          { field: "status", op: "any_of", values: ["open", "done"] },
          { field: "region", op: "any_of", values: ["north"] },
        ],
      }),
    ).toBe(true);
    expect(
      isQueryIndexed(DEF, {
        ...search,
        filters: [{ field: "name", op: "equals", value: "x" }],
      }),
    ).toBe(false);
    expect(
      isQueryIndexed(DEF, {
        ...search,
        filters: [
          { field: "created_at", op: "greater_or_equal", value: "2026-01-01" },
        ],
      }),
    ).toBe(false);
  });
});

describe("indexId", () => {
  test("a sort index is its filter set and its sort order; a text or array index is its column", () => {
    expect(
      indexId({ filter: ["status", "region"], sort: ["total", "id"] }),
    ).toBe("region+status|total>id");
    expect(indexId({ text: "name" })).toBe("text:name");
    expect(indexId({ array: "tags" })).toBe("array:tags");
  });
});

describe("listIndexKinds", () => {
  test("each operator names the kinds of index that answer it", () => {
    expect(listIndexKinds("equals")).toEqual(["filter", "sort"]);
    expect(listIndexKinds("contains")).toEqual(["text"]);
    expect(listIndexKinds("starts_with")).toEqual(["text"]);
    expect(listIndexKinds("ends_with")).toEqual(["text"]);
    expect(listIndexKinds("between")).toEqual(["sort"]);
    expect(listIndexKinds("in_period")).toEqual(["sort"]);
    expect(listIndexKinds("any_of")).toEqual(["filter", "array"]);
    expect(listIndexKinds("all_of")).toEqual(["array"]);
    expect(listIndexKinds("blank")).toEqual(["filter"]);
    expect(listIndexKinds("not_blank")).toEqual(["filter"]);
    const unanswered: FilterOp[] = [
      "not_equals",
      "not_contains",
      "not_between",
      "none_of",
    ];
    for (const op of unanswered) {
      expect(OPERATORS[op].index).toBeNull();
      expect(listIndexKinds(op)).toEqual([]);
    }
  });
});

describe("the HTTP source", () => {
  test("it builds its capabilities from the def's own indexes and facet", () => {
    const source = createHttpSource(DEF, "/things");
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

describe("gridDefCapabilities", () => {
  const caps = gridDefCapabilities(DEF);

  test("they are the indexes, read once", () => {
    expect(caps.searchIsOrdered).toBe(false);
    const compared: FilterOp[] = [
      "equals",
      "not_equals",
      "greater_than",
      "greater_or_equal",
      "less_than",
      "less_or_equal",
      "between",
      "not_between",
    ];
    const text: FilterOp[] = [
      "equals",
      "not_equals",
      "contains",
      "not_contains",
      "starts_with",
      "ends_with",
    ];
    expect(caps.filterOps).toEqual({
      number: compared,
      created_at: compared,
      total: compared,
      status: ["any_of"],
      region: ["any_of"],
      name: text,
      note: [...text, "blank", "not_blank"],
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
    expect(getIndex(DEF, undeclared)).toBeNull();
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
    expect(
      gridDefCapabilities({ ...DEF, facet: undefined }).isFacetCountExact(BASE),
    ).toBe(false);
  });
});
