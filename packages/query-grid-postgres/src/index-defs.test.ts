import { describe, expect, test } from "bun:test";

import {
  normalizeStoredGridDef,
  type IndexDef,
  type IndexedGridDef,
} from "@kikstart/query-grid";

import { TEST_DEF } from "./grid-def.fixture.ts";
import { validateGridDef } from "./index-defs.ts";
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
        { equals: [], sort: "note" },
        { equals: ["missing"], sort: "total" },
        { equals: [], sort: "name", range: true },
        { equals: [], sort: "created_at" },
        { equals: [], sort: "created_at" },
      ],
    };
    const problems = validateGridDef(broken).join("\n");
    expect(problems).toContain("a nullable field cannot be a keyset sort");
    expect(problems).toContain("unknown equality field missing");
    expect(problems).toContain("name is a text, which has no range filter");
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
        indexes: [{ equals: [], sort: "total" }],
      }),
    ).toContain("the default sort with no filter is not a declared index");
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
      withIndex({ equals: ["region"], sort: "total", then: ["number"] }),
      withIndex({ equals: ["status"], sort: "number", blank: ["note"] }),
      { ...STORED, textIndexes: ["name"], arrayIndexes: ["tags"] },
    ];
    for (const def of valid) {
      const result = normalizeStoredGridDef(JSON.parse(JSON.stringify(def)));
      expect(result.ok).toBe(true);
      expect(result.ok && validateGridDef(toPostgres(result.def))).toEqual([]);
    }
  });

  test("each index rule a stored def is refused for, the server refuses too", () => {
    const refused: [string, IndexedGridDef][] = [
      ["index_nullable_sort", withIndex({ equals: [], sort: "note" })],
      ["index_no_range", withIndex({ equals: [], sort: "name", range: true })],
      [
        "index_sort_is_equality",
        withIndex({ equals: ["status"], sort: "status" }),
      ],
      ["index_array_sort", withIndex({ equals: [], sort: "tags" })],
      [
        "index_array_equality",
        withIndex({ equals: ["tags"], sort: "created_at" }),
      ],
      [
        "index_then_repeats",
        withIndex({ equals: ["region"], sort: "total", then: ["region"] }),
      ],
      [
        "index_never_blank",
        withIndex({ equals: [], sort: "total", blank: ["name"] }),
      ],
      [
        "index_blank_is_filtered",
        withIndex({ equals: ["note"], sort: "total", blank: ["note"] }),
      ],
      [
        "index_duplicate",
        withIndex({ equals: ["status"], sort: "created_at" }),
      ],
      ["index_not_text", { ...STORED, textIndexes: ["status"] }],
      ["index_not_array", { ...STORED, arrayIndexes: ["name"] }],
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
