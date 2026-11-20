import { describe, expect, test } from "bun:test";

import {
  normalizeStoredGridDef,
  type IndexDef,
  type IndexedGridDef,
} from "@kikstart/query-grid";

import { TEST_DEF } from "./grid-def.fixture.ts";
import { describeIndex, validateGridDef } from "./index-defs.ts";
import type { PostgresGridDef } from "./storage.ts";

describe("validateGridDef", () => {
  test("the test def is valid", () => {
    expect(validateGridDef(TEST_DEF)).toEqual([]);
  });

  test("bad indexes are named", () => {
    const broken: PostgresGridDef = {
      ...TEST_DEF,
      totals: ["name", "total", "total"],
      fields: TEST_DEF.fields.map((field) =>
        field.key === "total" ? { ...field, currency: "rand" } : field,
      ),
      search: ["created_at", "missing"],
      indexes: [
        { filter: [], sort: ["note"] },
        { filter: ["missing"], sort: ["total"] },
        { filter: ["status"], sort: ["status"] },
        { filter: ["region"], sort: [] },
        { filter: [], sort: ["created_at"] },
        { filter: [], sort: ["created_at"] },
        { not: "an index" } as unknown as IndexDef,
      ],
    };
    const problems = validateGridDef(broken).join("\n");
    expect(problems).toContain("a nullable field cannot be a keyset sort");
    expect(problems).toContain("unknown filter field missing");
    expect(problems).toContain("status is both a filter and a sort column");
    expect(problems).toContain("an index needs at least one sort column");
    expect(problems).toContain(
      "an index is { filter, sort }, { text } or { array }; the search columns are `search` on the def",
    );
    expect(problems).toContain("is declared twice");
    expect(problems).toContain("created_at is a datetime");
    expect(problems).toContain("unknown field missing");
    expect(problems).toContain("total: name is not a non-null money");
    expect(problems).toContain("total: total is declared twice");
    expect(problems).toContain("total: rand is not a currency code");
  });

  test("the default sort must be an index", () => {
    expect(
      validateGridDef({
        ...TEST_DEF,
        indexes: [{ filter: [], sort: ["total"] }],
      }),
    ).toContain("the default sort with no filter is not a declared index");
  });
});

describe("describeIndex", () => {
  test("names the filters, the sort and the further sort columns", () => {
    expect(
      describeIndex({ filter: ["status_code"], sort: ["created_at"] }),
    ).toBe("status_code =, sort created_at");
    expect(describeIndex({ filter: [], sort: ["item_count", "total"] })).toBe(
      "no filter, sort item_count, then total",
    );
  });
});

describe("a stored def and validateGridDef agree on the index rules", () => {
  const { table, ...storable } = TEST_DEF;
  const STORED: IndexedGridDef = {
    ...storable,
    facet: { field: "status" },
    fields: [...TEST_DEF.fields, { key: "tags", label: "Tags", type: "array" }],
  };

  function toPostgres(def: IndexedGridDef): PostgresGridDef {
    return {
      ...def,
      table,
      facet: def.facet && { ...def.facet, counterTable: "thing_counts" },
    };
  }

  function withIndex(index: IndexDef): IndexedGridDef {
    return { ...STORED, indexes: [...STORED.indexes, index] };
  }

  test("a def accepted as stored is valid for the server too", () => {
    const valid: IndexedGridDef[] = [
      STORED,
      withIndex({ filter: ["region"], sort: ["total", "number"] }),
      withIndex({ filter: ["status", "note"], sort: ["number"] }),
      withIndex({ text: "name" }),
      withIndex({ array: "tags" }),
    ];
    for (const def of valid) {
      const result = normalizeStoredGridDef(JSON.parse(JSON.stringify(def)));
      expect(result.ok).toBe(true);
      expect(result.ok && validateGridDef(toPostgres(result.def))).toEqual([]);
    }
  });

  test("each index rule a stored def is refused for, the server refuses too", () => {
    const refused: [string, IndexedGridDef][] = [
      ["index_nullable_sort", withIndex({ filter: [], sort: ["note"] })],
      [
        "index_sort_is_filter",
        withIndex({ filter: ["status"], sort: ["status"] }),
      ],
      ["index_array_sort", withIndex({ filter: [], sort: ["tags"] })],
      [
        "index_array_filter",
        withIndex({ filter: ["tags"], sort: ["created_at"] }),
      ],
      [
        "index_sort_repeats",
        withIndex({ filter: ["region"], sort: ["total", "id"] }),
      ],
      [
        "index_duplicate",
        withIndex({ filter: ["status"], sort: ["created_at"] }),
      ],
      ["index_not_text", withIndex({ text: "status" })],
      ["index_not_array", withIndex({ array: "name" })],
    ];
    for (const [code, def] of refused) {
      const result = normalizeStoredGridDef(JSON.parse(JSON.stringify(def)));
      expect(
        result.ok ? [] : result.problems.map((problem) => problem.code),
      ).toEqual([code]);
      expect(validateGridDef(toPostgres(def))).toHaveLength(1);
    }
  });
});
