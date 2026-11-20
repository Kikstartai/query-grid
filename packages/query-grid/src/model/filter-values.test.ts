import { describe, expect, test } from "bun:test";

import {
  canExpandNoneOf,
  convertFilter,
  expandNoneOf,
  fromDayBound,
  fromNumberBound,
  isPointBounds,
  matchesFilter,
  toDayBound,
  toFilterBounds,
  toNumberBound,
} from "./filter-values.ts";
import type { BaseFieldDef } from "./grid-def.ts";
import type { Filter, ListFilter } from "./query-state.ts";

const SIZE: BaseFieldDef = { key: "size", label: "Size", type: "integer" };
const RATE: BaseFieldDef = {
  key: "rate",
  label: "Rate",
  type: "decimal",
  nullable: true,
};
const PRICE: BaseFieldDef = { key: "price", label: "Price", type: "money" };
const DUE: BaseFieldDef = {
  key: "due",
  label: "Due",
  type: "date",
  nullable: true,
};
const CREATED: BaseFieldDef = {
  key: "created_at",
  label: "Created",
  type: "datetime",
};
const NAME: BaseFieldDef = {
  key: "name",
  label: "Name",
  type: "text",
  nullable: true,
};
const STATUS: BaseFieldDef = {
  key: "status",
  label: "Status",
  type: "enum",
  nullable: true,
  options: [
    { value: "open", label: "Open" },
    { value: "done", label: "Done" },
    { value: "closed", label: "Closed" },
  ],
};
const STARRED: BaseFieldDef = {
  key: "starred",
  label: "Starred",
  type: "boolean",
};
const TAGS: BaseFieldDef = {
  key: "tags",
  label: "Tags",
  type: "array",
  nullable: true,
};

const START = "2026-03-03T00:00:00.000000Z";
const END = "2026-03-03T23:59:59.999999Z";

function closed(min: string | null, max: string | null) {
  return { min, max, minOpen: false, maxOpen: false, outside: false };
}

function list(
  field: BaseFieldDef,
  op: ListFilter["op"],
  values: (string | null)[],
): ListFilter {
  return { field: field.key, op, values };
}

function toLocalDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

describe("the bounds of a compared filter", () => {
  test("a number keeps its value on each side the operator names", () => {
    const at = (filter: Filter) => toFilterBounds(SIZE, filter);
    expect(at({ field: "size", op: "equals", value: "5" })).toEqual(
      closed("5", "5"),
    );
    expect(at({ field: "size", op: "not_equals", value: "5" })).toEqual({
      ...closed("5", "5"),
      outside: true,
    });
    expect(at({ field: "size", op: "greater_than", value: "5" })).toEqual({
      ...closed("5", null),
      minOpen: true,
    });
    expect(at({ field: "size", op: "greater_or_equal", value: "5" })).toEqual(
      closed("5", null),
    );
    expect(at({ field: "size", op: "less_than", value: "9" })).toEqual({
      ...closed(null, "9"),
      maxOpen: true,
    });
    expect(at({ field: "size", op: "less_or_equal", value: "9" })).toEqual(
      closed(null, "9"),
    );
    expect(at({ field: "size", op: "between", min: "5", max: "9" })).toEqual(
      closed("5", "9"),
    );
    expect(
      at({ field: "size", op: "not_between", min: "5", max: "9" }),
    ).toEqual({ ...closed("5", "9"), outside: true });
  });

  test("an operator that compares nothing has no bounds", () => {
    expect(toFilterBounds(SIZE, { field: "size", op: "blank" })).toBeNull();
    expect(toFilterBounds(STATUS, list(STATUS, "any_of", ["open"]))).toBeNull();
    expect(
      toFilterBounds(DUE, { field: "due", op: "in_period", preset: "today" }),
    ).toBeNull();
    expect(
      toFilterBounds(NAME, { field: "name", op: "contains", value: "a" }),
    ).toBeNull();
  });

  test("a day on a datetime means the whole of that day", () => {
    const at = (filter: Filter) => toFilterBounds(CREATED, filter);
    const day = "2026-03-03";
    expect(at({ field: "created_at", op: "equals", value: day })).toEqual(
      closed(START, END),
    );
    expect(at({ field: "created_at", op: "not_equals", value: day })).toEqual({
      ...closed(START, END),
      outside: true,
    });
    expect(at({ field: "created_at", op: "greater_than", value: day })).toEqual(
      { ...closed(END, null), minOpen: true },
    );
    expect(
      at({ field: "created_at", op: "greater_or_equal", value: day }),
    ).toEqual(closed(START, null));
    expect(at({ field: "created_at", op: "less_than", value: day })).toEqual({
      ...closed(null, START),
      maxOpen: true,
    });
    expect(
      at({ field: "created_at", op: "less_or_equal", value: day }),
    ).toEqual(closed(null, END));
    expect(
      at({
        field: "created_at",
        op: "between",
        min: day,
        max: "2026-03-09",
      }),
    ).toEqual(closed(START, "2026-03-09T23:59:59.999999Z"));
    expect(
      at({
        field: "created_at",
        op: "not_between",
        min: day,
        max: "2026-03-09",
      }),
    ).toEqual({
      ...closed(START, "2026-03-09T23:59:59.999999Z"),
      outside: true,
    });
  });

  test("an instant on a datetime and a day on a date are taken as they are", () => {
    const instant = "2026-03-03T10:00:00Z";
    expect(
      toFilterBounds(CREATED, {
        field: "created_at",
        op: "equals",
        value: instant,
      }),
    ).toEqual(closed(instant, instant));
    expect(
      toFilterBounds(DUE, {
        field: "due",
        op: "greater_than",
        value: "2026-03-03",
      }),
    ).toEqual({ ...closed("2026-03-03", null), minOpen: true });
  });

  test("a point is one value on both sides", () => {
    expect(isPointBounds(closed("5", "5"))).toBe(true);
    expect(isPointBounds(closed("5", "9"))).toBe(false);
    expect(isPointBounds(closed(null, null))).toBe(false);
  });
});

describe("the wire form of a bound", () => {
  test("a day bound is the day's first or last instant and reads back as the day", () => {
    expect(toDayBound("2026-03-03", false)).toBe(START);
    expect(toDayBound("2026-03-03", true)).toBe(END);
    expect(fromDayBound(END)).toBe("2026-03-03");
  });

  test("money travels in cents, an integer rounded and a decimal as it is", () => {
    expect(toNumberBound(PRICE, 12.34)).toBe("1234");
    expect(toNumberBound(SIZE, 2.6)).toBe("3");
    expect(toNumberBound(RATE, 1.5)).toBe("1.5");
    expect(toNumberBound(SIZE, null)).toBeNull();
    expect(fromNumberBound(PRICE, "1234")).toBe(12.34);
    expect(fromNumberBound(SIZE, "7")).toBe(7);
    expect(fromNumberBound(SIZE, null)).toBeNull();
  });
});

describe("a filter turned into another operator", () => {
  const between: Filter = { field: "size", op: "between", min: "5", max: "9" };

  test("the same operator is the same filter", () => {
    expect(convertFilter(between, "between")).toBe(between);
  });

  test("a pair keeps its first value as one, and one value becomes both sides", () => {
    expect(convertFilter(between, "greater_than")).toEqual({
      field: "size",
      op: "greater_than",
      value: "5",
    });
    expect(convertFilter(between, "not_between")).toEqual({
      field: "size",
      op: "not_between",
      min: "5",
      max: "9",
    });
    expect(
      convertFilter({ field: "size", op: "equals", value: "4" }, "between"),
    ).toEqual({ field: "size", op: "between", min: "4", max: "4" });
  });

  test("a list moves between list operators, and holds-all drops the blank", () => {
    const any = list(TAGS, "any_of", ["a", null]);
    expect(convertFilter(any, "none_of")).toEqual(
      list(TAGS, "none_of", ["a", null]),
    );
    expect(convertFilter(any, "all_of")).toEqual(list(TAGS, "all_of", ["a"]));
    expect(convertFilter(list(TAGS, "any_of", [null]), "all_of")).toBeNull();
  });

  test("a list and a single value do not turn into each other", () => {
    expect(convertFilter(list(TAGS, "any_of", ["a"]), "equals")).toBeNull();
    expect(
      convertFilter({ field: "size", op: "equals", value: "4" }, "any_of"),
    ).toBeNull();
    expect(convertFilter({ field: "size", op: "blank" }, "equals")).toBeNull();
  });

  test("an operator with no value keeps only the field, and a period is never a target", () => {
    expect(convertFilter(between, "blank")).toEqual({
      field: "size",
      op: "blank",
    });
    expect(convertFilter(between, "in_period")).toBeNull();
    expect(
      convertFilter(
        { field: "due", op: "in_period", preset: "today" },
        "between",
      ),
    ).toBeNull();
  });
});

describe("none of a field's fixed values", () => {
  test("is any of the values it keeps, or blank when the field may be", () => {
    expect(expandNoneOf(STATUS, list(STATUS, "none_of", ["open"]))).toEqual(
      list(STATUS, "any_of", ["done", "closed", null]),
    );
    expect(
      expandNoneOf(STATUS, list(STATUS, "none_of", ["open", null])),
    ).toEqual(list(STATUS, "any_of", ["done", "closed"]));
    expect(expandNoneOf(STARRED, list(STARRED, "none_of", ["true"]))).toEqual(
      list(STARRED, "any_of", ["false"]),
    );
  });

  test("can expand only to between one value and the field's cap", () => {
    expect(canExpandNoneOf(STATUS, list(STATUS, "none_of", ["open"]))).toBe(
      true,
    );
    expect(
      canExpandNoneOf(STARRED, list(STARRED, "none_of", ["true", "false"])),
    ).toBe(false);
    expect(
      canExpandNoneOf(
        STATUS,
        list(STATUS, "none_of", ["open", "done", "closed"]),
      ),
    ).toBe(true);
    expect(
      canExpandNoneOf(
        STATUS,
        list(STATUS, "none_of", ["open", "done", "closed", null]),
      ),
    ).toBe(false);
    const capped = { ...STATUS, maxValues: 2 };
    expect(canExpandNoneOf(capped, list(STATUS, "none_of", ["open"]))).toBe(
      false,
    );
    expect(
      canExpandNoneOf(capped, list(STATUS, "none_of", ["open", "done"])),
    ).toBe(true);
  });
});

describe("whether a cell matches a filter", () => {
  test("a compared filter reads the cell as a number or an instant", () => {
    const greater: Filter = { field: "size", op: "greater_than", value: "5" };
    expect(matchesFilter(SIZE, greater, 5)).toBe(false);
    expect(matchesFilter(SIZE, greater, 6)).toBe(true);
    const outside: Filter = {
      field: "rate",
      op: "not_between",
      min: "1",
      max: "2",
    };
    expect(matchesFilter(RATE, outside, 1.5)).toBe(false);
    expect(matchesFilter(RATE, outside, 2.5)).toBe(true);
    expect(matchesFilter(RATE, outside, null)).toBe(true);
    expect(
      matchesFilter(
        RATE,
        { field: "rate", op: "between", min: "1", max: "2" },
        null,
      ),
    ).toBe(false);
  });

  test("a day on a datetime holds every instant of that day", () => {
    const on: Filter = {
      field: "created_at",
      op: "equals",
      value: "2026-03-03",
    };
    expect(matchesFilter(CREATED, on, "2026-03-03T00:00:00.000000Z")).toBe(
      true,
    );
    expect(matchesFilter(CREATED, on, "2026-03-03T23:59:59.000000Z")).toBe(
      true,
    );
    expect(matchesFilter(CREATED, on, "2026-03-04T00:00:00.000000Z")).toBe(
      false,
    );
    const after: Filter = {
      field: "created_at",
      op: "greater_than",
      value: "2026-03-03",
    };
    expect(matchesFilter(CREATED, after, "2026-03-03T23:00:00.000000Z")).toBe(
      false,
    );
    expect(matchesFilter(CREATED, after, "2026-03-04T00:00:00.000000Z")).toBe(
      true,
    );
  });

  test("a period is resolved against today", () => {
    const today: Filter = { field: "due", op: "in_period", preset: "today" };
    const now = new Date();
    const yesterday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
    );
    expect(matchesFilter(DUE, today, toLocalDay(now))).toBe(true);
    expect(matchesFilter(DUE, today, toLocalDay(yesterday))).toBe(false);
    expect(matchesFilter(DUE, today, null)).toBe(false);
  });

  test("the text operators ignore case and the value's spaces, and equals is exact", () => {
    const at = (op: Filter["op"], value: string, cell: string | null) =>
      matchesFilter(NAME, { field: "name", op, value } as Filter, cell);
    expect(at("contains", " VOICE ", "Invoice")).toBe(true);
    expect(at("starts_with", "inv", "Invoice")).toBe(true);
    expect(at("ends_with", "ICE", "Invoice")).toBe(true);
    expect(at("contains", "x", null)).toBe(false);
    expect(at("not_contains", "x", null)).toBe(true);
    expect(at("not_contains", "voice", "Invoice")).toBe(false);
    expect(at("equals", " Invoice ", "Invoice")).toBe(true);
    expect(at("equals", "invoice", "Invoice")).toBe(false);
    expect(at("not_equals", "invoice", "Invoice")).toBe(true);
    expect(at("not_equals", "x", null)).toBe(true);
  });

  test("blank is a missing value, an empty text or an empty list", () => {
    const blank: Filter = { field: "name", op: "blank" };
    const filled: Filter = { field: "name", op: "not_blank" };
    for (const cell of [null, undefined, "", []]) {
      expect(matchesFilter(NAME, blank, cell)).toBe(true);
      expect(matchesFilter(NAME, filled, cell)).toBe(false);
    }
    expect(matchesFilter(NAME, blank, "a")).toBe(false);
    expect(matchesFilter(NAME, filled, "a")).toBe(true);
  });

  test("a list matches a value, a shared array value or a blank cell when null is in it", () => {
    const status = list(STATUS, "any_of", ["open", null]);
    expect(matchesFilter(STATUS, status, "open")).toBe(true);
    expect(matchesFilter(STATUS, status, "done")).toBe(false);
    expect(matchesFilter(STATUS, status, null)).toBe(true);
    expect(
      matchesFilter(STARRED, list(STARRED, "any_of", ["true"]), true),
    ).toBe(true);
    expect(matchesFilter(STATUS, list(STATUS, "none_of", ["open"]), null)).toBe(
      true,
    );
    expect(
      matchesFilter(STATUS, list(STATUS, "none_of", ["open", null]), null),
    ).toBe(false);
    const tags = ["red", "blue"];
    expect(matchesFilter(TAGS, list(TAGS, "any_of", ["blue", "x"]), tags)).toBe(
      true,
    );
    expect(
      matchesFilter(TAGS, list(TAGS, "all_of", ["red", "blue"]), tags),
    ).toBe(true);
    expect(matchesFilter(TAGS, list(TAGS, "all_of", ["red", "x"]), tags)).toBe(
      false,
    );
    expect(matchesFilter(TAGS, list(TAGS, "all_of", ["red"]), null)).toBe(
      false,
    );
    expect(matchesFilter(TAGS, list(TAGS, "none_of", ["red"]), tags)).toBe(
      false,
    );
    expect(matchesFilter(TAGS, list(TAGS, "none_of", ["x"]), tags)).toBe(true);
    expect(matchesFilter(TAGS, list(TAGS, "any_of", [null]), [])).toBe(true);
  });
});
