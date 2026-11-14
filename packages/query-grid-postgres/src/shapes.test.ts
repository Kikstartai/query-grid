import { describe, expect, test } from "bun:test";

import { capabilities } from "./capabilities.ts";
import type { QueryState } from "@kikstart/query-grid";

import { TEST_DEF } from "./grid-def.fixture.ts";
import { matchShape, validateGridDef } from "./shapes.ts";
import type { ServerGridDef } from "./storage.ts";

const SHAPES = TEST_DEF.shapes;
const BASE: QueryState = {
  equals: {},
  range: null,
  quick: null,
  sort: TEST_DEF.defaultSort,
  cursor: null,
};

describe("validateGridDef", () => {
  test("the test def is valid", () => {
    expect(validateGridDef(TEST_DEF)).toEqual([]);
  });

  test("bad shapes are named", () => {
    const broken: ServerGridDef = {
      ...TEST_DEF,
      total: { field: "name" },
      shapes: [
        { equals: [], sort: "note" },
        { equals: ["total"], sort: "created_at" },
        { equals: [], sort: "created_at" },
        { equals: [], sort: "created_at" },
        { quick: ["created_at", "missing"] },
      ],
    };
    const problems = validateGridDef(broken).join("\n");
    expect(problems).toContain("a nullable field cannot be a keyset sort");
    expect(problems).toContain("total does not offer eq");
    expect(problems).toContain("is declared twice");
    expect(problems).toContain("created_at is a datetime");
    expect(problems).toContain("unknown field missing");
    expect(problems).toContain("total: name is not a non-null money");
  });

  test("the default sort must be a shape", () => {
    expect(
      validateGridDef({ ...TEST_DEF, shapes: [{ equals: [], sort: "total" }] }),
    ).toContain("the default sort with no filter is not a declared shape");
  });
});

describe("matchShape", () => {
  test("the equality set must match exactly", () => {
    expect(matchShape(SHAPES, BASE)).toEqual(SHAPES[0]);
    expect(
      matchShape(SHAPES, {
        ...BASE,
        equals: { status: ["open"], region: ["north"] },
      }),
    ).toBeNull();
  });

  test("a range sits on the sort column of a shape that allows it", () => {
    const range = { field: "created_at", min: "2026-01-01", max: null };
    expect(matchShape(SHAPES, { ...BASE, range })).not.toBeNull();
    expect(
      matchShape(SHAPES, { ...BASE, equals: { status: ["open"] }, range }),
    ).toBeNull();
    expect(
      matchShape(SHAPES, {
        ...BASE,
        sort: { field: "total", direction: "asc" },
        range,
      }),
    ).toBeNull();
  });

  test("several values of one field match the same shape unless it opts out", () => {
    const several = { ...BASE, equals: { status: ["open", "done"] } };
    expect(matchShape(SHAPES, several)).toEqual(SHAPES[2]);
    const single = SHAPES.map((shape) =>
      "equals" in shape && shape.equals.includes("status")
        ? { ...shape, multi: false }
        : shape,
    );
    expect(matchShape(single, several)).toBeNull();
    expect(
      matchShape(single, { ...BASE, equals: { status: ["open"] } }),
    ).not.toBeNull();
    expect(capabilities(single).isAnswerable(several)).toBe(false);
  });

  test("a quick filter combines with no other filter", () => {
    expect(matchShape(SHAPES, { ...BASE, quick: "abc" })).toEqual({
      quick: ["name", "number"],
    });
    expect(
      matchShape(SHAPES, {
        ...BASE,
        quick: "abc",
        equals: { status: ["open"] },
      }),
    ).toBeNull();
  });
});

describe("capabilities", () => {
  const caps = capabilities(SHAPES, { facetField: "status" });

  test("they are the shapes, read once", () => {
    expect(caps.mode).toBe("server");
    expect(caps.sortFields).toEqual(["created_at", "total"]);
    expect(caps.quickFields).toEqual(["name", "number"]);
  });

  test("a query is answerable exactly when a shape matches it", () => {
    const undeclared: QueryState = {
      ...BASE,
      equals: { region: ["north"] },
      sort: { field: "total", direction: "asc" },
    };
    expect(caps.isAnswerable(BASE)).toBe(true);
    expect(caps.isAnswerable(undeclared)).toBe(false);
    expect(matchShape(SHAPES, undeclared)).toBeNull();
  });

  test("facet counts show only while the facet is the only filter", () => {
    expect(caps.isFacetCountShown(BASE)).toBe(true);
    expect(
      caps.isFacetCountShown({ ...BASE, equals: { status: ["open"] } }),
    ).toBe(true);
    expect(
      caps.isFacetCountShown({ ...BASE, equals: { region: ["north"] } }),
    ).toBe(false);
    expect(capabilities(SHAPES).isFacetCountShown(BASE)).toBe(false);
  });
});
