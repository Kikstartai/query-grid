import { describe, expect, test } from "bun:test";

import { listFilterChips } from "./chips.ts";
import {
  EMPTY_VALUE,
  getReservedValue,
  listReservedValues,
  normalizeEqualsValues,
  NOT_EMPTY_VALUE,
} from "./field-values.ts";
import { getField, type GridRow, type QueryState } from "./field-types.ts";
import { TEST_DEF } from "./grid-def.fixture.ts";
import { createMemorySource } from "./memory-source.ts";
import { defaultQuery } from "./query-actions.ts";
import { validateQueryValues } from "./query-validate.ts";

const NOTE = getField(TEST_DEF, "note")!;
const NAME = getField(TEST_DEF, "name")!;
const BASE = defaultQuery(TEST_DEF);
const signal = new AbortController().signal;

const ROWS: GridRow[] = [
  { id: "a", name: "A", note: "fragile" },
  { id: "b", name: "B", note: null },
  { id: "c", name: "C", note: "gift" },
  { id: "d", name: "D" },
];

function withNote(...values: string[]): QueryState {
  return { ...BASE, equals: { note: values } };
}

describe("reserved values", () => {
  test("only a nullable field has them", () => {
    expect(listReservedValues(NOTE)).toEqual([EMPTY_VALUE, NOT_EMPTY_VALUE]);
    expect(listReservedValues(NAME)).toEqual([]);
    expect(getReservedValue(NOTE, EMPTY_VALUE)).toBe("empty");
    expect(getReservedValue(NOTE, NOT_EMPTY_VALUE)).toBe("not_empty");
    expect(getReservedValue(NAME, EMPTY_VALUE)).toBeNull();
    expect(getReservedValue(NOTE, "fragile")).toBeNull();
  });

  test("empty validates alone and beside real values; not empty only alone", () => {
    expect(validateQueryValues(TEST_DEF, withNote(EMPTY_VALUE))).toBeNull();
    expect(validateQueryValues(TEST_DEF, withNote(NOT_EMPTY_VALUE))).toBeNull();
    expect(
      validateQueryValues(TEST_DEF, withNote(EMPTY_VALUE, "fragile")),
    ).toBeNull();
    expect(
      validateQueryValues(TEST_DEF, withNote(NOT_EMPTY_VALUE, "fragile")),
    ).toEqual({ code: "invalid_value", params: { field: "note" } });
    expect(
      validateQueryValues(TEST_DEF, withNote(NOT_EMPTY_VALUE, EMPTY_VALUE)),
    ).toEqual({ code: "invalid_value", params: { field: "note" } });
  });

  test("on a field that is never empty the token is refused as an option", () => {
    expect(
      validateQueryValues(TEST_DEF, {
        ...BASE,
        equals: { status: [EMPTY_VALUE] },
      }),
    ).toEqual({ code: "invalid_value", params: { field: "status" } });
  });

  test("picking not empty drops the rest, and picking a value drops not empty", () => {
    expect(
      normalizeEqualsValues(NOTE, ["fragile"], ["fragile", NOT_EMPTY_VALUE]),
    ).toEqual([NOT_EMPTY_VALUE]);
    expect(
      normalizeEqualsValues(
        NOTE,
        [NOT_EMPTY_VALUE],
        [NOT_EMPTY_VALUE, "fragile"],
      ),
    ).toEqual(["fragile"]);
    expect(
      normalizeEqualsValues(NOTE, ["fragile"], ["fragile", EMPTY_VALUE]),
    ).toEqual(["fragile", EMPTY_VALUE]);
    expect(normalizeEqualsValues(NOTE, ["fragile", "gift"], ["gift"])).toEqual([
      "gift",
    ]);
  });
});

describe("the in-memory source and empty values", () => {
  const source = createMemorySource(TEST_DEF, ROWS);
  const ids = async (...values: string[]) => {
    const page = await source.fetchPage(
      { ...withNote(...values), sort: { field: "name", direction: "asc" } },
      10,
      signal,
    );
    return page.rows.map((row) => row.id);
  };

  test("empty matches a null and a missing value", async () => {
    expect(await ids(EMPTY_VALUE)).toEqual(["b", "d"]);
  });

  test("not empty matches every row with a value", async () => {
    expect(await ids(NOT_EMPTY_VALUE)).toEqual(["a", "c"]);
  });

  test("empty mixes with a real value", async () => {
    expect(await ids(EMPTY_VALUE, "gift")).toEqual(["b", "c", "d"]);
  });
});

describe("chips", () => {
  test("a reserved value is marked, so the UI words it", () => {
    const [chip] = listFilterChips(TEST_DEF, withNote(EMPTY_VALUE, "gift"));
    expect(chip.kind).toBe("equals");
    if (chip.kind !== "equals") {
      return;
    }
    expect(chip.values.map((value) => value.reserved)).toEqual(["empty", null]);
  });
});
