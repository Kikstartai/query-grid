import { describe, expect, test } from "bun:test";

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
      quick: ["created_at", "missing"],
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
