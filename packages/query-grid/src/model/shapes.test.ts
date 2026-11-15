import { describe, expect, test } from "bun:test";

import type { QueryState } from "./field-types.ts";
import { TEST_DEF, TEST_SHAPES } from "./grid-def.fixture.ts";
import { createHttpSource } from "./http-source.ts";
import { matchShape, shapeCapabilities } from "./shapes.ts";

const SHAPES = TEST_SHAPES;
const BASE: QueryState = {
  equals: {},
  range: null,
  quick: null,
  sort: TEST_DEF.defaultSort,
  cursor: null,
};

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
    expect(shapeCapabilities(single).isAnswerable(several)).toBe(false);
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

describe("the HTTP source", () => {
  test("it builds its capabilities from the def's own shapes and facet", () => {
    const source = createHttpSource({ ...TEST_DEF, shapes: SHAPES }, "/things");
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

describe("shapeCapabilities", () => {
  const caps = shapeCapabilities(SHAPES, { facetField: "status" });

  test("they are the shapes, read once", () => {
    expect(caps.mode).toBe("server");
    expect(caps.equalsFields).toEqual(["status", "region"]);
    expect(caps.rangeFields).toEqual(["created_at", "total"]);
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
    expect(shapeCapabilities(SHAPES).isFacetCountShown(BASE)).toBe(false);
  });
});
