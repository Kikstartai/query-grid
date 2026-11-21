import { resolveDatePreset, resolveDayPreset } from "./date-presets.ts";
import {
  resolveMaxValues,
  type BaseFieldDef,
  type GridValue,
} from "./grid-def.ts";
import {
  getOperatorShape,
  listFixedValues,
  type FilterOp,
} from "./operators.ts";
import type {
  BetweenFilter,
  Filter,
  ListFilter,
  PeriodFilter,
} from "./query-state.ts";
import { toComparable } from "./sort-rows.ts";

const DAY_LENGTH = 10;

export function toDayBound(day: string, end: boolean): string {
  return `${day}T${end ? "23:59:59.999999" : "00:00:00.000000"}Z`;
}

export function fromDayBound(bound: string): string {
  return bound.slice(0, DAY_LENGTH);
}

export function toNumberBound(
  field: BaseFieldDef,
  value: number | null,
): string | null {
  if (value === null) {
    return null;
  }
  if (field.type === "decimal") {
    return String(value);
  }
  return String(Math.round(field.type === "money" ? value * 100 : value));
}

export function fromNumberBound(
  field: BaseFieldDef,
  bound: string | null,
): number | null {
  if (bound === null) {
    return null;
  }
  return field.type === "money" ? Number(bound) / 100 : Number(bound);
}

export interface FilterBounds {
  min: string | null;
  max: string | null;
  minOpen: boolean;
  maxOpen: boolean;
  outside: boolean;
}

// A datetime compared with a day means the whole of that day, so its bounds are the day's first and last instants.
function isDayOfInstants(field: BaseFieldDef, value: string): boolean {
  return field.type === "datetime" && value.length === DAY_LENGTH;
}

function startOf(field: BaseFieldDef, value: string): string {
  return isDayOfInstants(field, value) ? toDayBound(value, false) : value;
}

function endOf(field: BaseFieldDef, value: string): string {
  return isDayOfInstants(field, value) ? toDayBound(value, true) : value;
}

function bounds(
  min: string | null,
  max: string | null,
  patch: Partial<FilterBounds> = {},
): FilterBounds {
  return { min, max, minOpen: false, maxOpen: false, outside: false, ...patch };
}

export function toFilterBounds(
  field: BaseFieldDef,
  filter: Filter,
): FilterBounds | null {
  switch (filter.op) {
    case "equals":
    case "not_equals":
      return bounds(startOf(field, filter.value), endOf(field, filter.value), {
        outside: filter.op === "not_equals",
      });
    case "greater_than":
      return bounds(endOf(field, filter.value), null, { minOpen: true });
    case "greater_or_equal":
      return bounds(startOf(field, filter.value), null);
    case "less_than":
      return bounds(null, startOf(field, filter.value), { maxOpen: true });
    case "less_or_equal":
      return bounds(null, endOf(field, filter.value));
    case "between":
    case "not_between":
      return bounds(startOf(field, filter.min), endOf(field, filter.max), {
        outside: filter.op === "not_between",
      });
    default:
      return null;
  }
}

export function isPointBounds(value: FilterBounds): boolean {
  return value.min !== null && value.min === value.max;
}

export function expandNoneOf(
  field: BaseFieldDef,
  filter: ListFilter,
): ListFilter {
  const excluded = filter.values;
  const kept: (string | null)[] = (listFixedValues(field) ?? []).filter(
    (value) => !excluded.includes(value),
  );
  const blank = field.nullable === true && !excluded.includes(null);
  return {
    field: filter.field,
    op: "any_of",
    values: blank ? [...kept, null] : kept,
  };
}

export function canExpandNoneOf(
  field: BaseFieldDef,
  filter: ListFilter,
): boolean {
  const size = expandNoneOf(field, filter).values.length;
  return size > 0 && size <= resolveMaxValues(field);
}

function isBlankCell(cell: GridValue | undefined): boolean {
  return (
    cell === null ||
    cell === undefined ||
    cell === "" ||
    (Array.isArray(cell) && cell.length === 0)
  );
}

function holdsAny(
  cell: GridValue | undefined,
  values: (string | null)[],
): boolean {
  if (isBlankCell(cell)) {
    return values.includes(null);
  }
  if (Array.isArray(cell)) {
    return values.some((value) => value !== null && cell.includes(value));
  }
  return values.includes(String(cell));
}

function holdsAll(
  cell: GridValue | undefined,
  values: (string | null)[],
): boolean {
  return (
    Array.isArray(cell) &&
    values.every((value) => value === null || cell.includes(value))
  );
}

function createTextTest(
  op: FilterOp,
  value: string,
): (cell: string | null) => boolean {
  const trimmed = value.trim();
  const needle = trimmed.toLowerCase();
  switch (op) {
    case "equals":
      return (cell) => cell === trimmed;
    case "not_equals":
      return (cell) => cell !== trimmed;
    case "contains":
      return (cell) => cell !== null && cell.toLowerCase().includes(needle);
    case "not_contains":
      return (cell) => cell === null || !cell.toLowerCase().includes(needle);
    case "starts_with":
      return (cell) => cell !== null && cell.toLowerCase().startsWith(needle);
    case "ends_with":
      return (cell) => cell !== null && cell.toLowerCase().endsWith(needle);
    default:
      return () => false;
  }
}

function createBoundsTest(
  field: BaseFieldDef,
  value: FilterBounds,
): (cell: GridValue | undefined) => boolean {
  const min = value.min === null ? null : toComparable(field, value.min);
  const max = value.max === null ? null : toComparable(field, value.max);
  return (cell) => {
    const compared = toComparable(field, cell ?? null);
    if (compared === null) {
      return value.outside;
    }
    const above =
      min === null || (value.minOpen ? compared > min : compared >= min);
    const below =
      max === null || (value.maxOpen ? compared < max : compared <= max);
    return (above && below) !== value.outside;
  };
}

export function resolvePeriod(
  field: BaseFieldDef,
  filter: PeriodFilter,
  now: Date,
): BetweenFilter {
  const period =
    field.type === "date"
      ? resolveDayPreset(filter.preset, now)
      : resolveDatePreset(filter.preset, now);
  return { field: filter.field, op: "between", ...period };
}

function toTextCell(cell: GridValue | undefined): string | null {
  return cell === null || cell === undefined ? null : String(cell);
}

export function createFilterTest(
  field: BaseFieldDef,
  filter: Filter,
): (cell: GridValue | undefined) => boolean {
  const resolved =
    filter.op === "in_period"
      ? resolvePeriod(field, filter, new Date())
      : filter;
  const range = field.type === "text" ? null : toFilterBounds(field, resolved);
  if (range) {
    return createBoundsTest(field, range);
  }
  switch (resolved.op) {
    case "blank":
      return isBlankCell;
    case "not_blank":
      return (cell) => !isBlankCell(cell);
    case "any_of": {
      const { values } = resolved;
      return (cell) => holdsAny(cell, values);
    }
    case "none_of": {
      const { values } = resolved;
      return (cell) => !holdsAny(cell, values);
    }
    case "all_of": {
      const { values } = resolved;
      return (cell) => holdsAll(cell, values);
    }
    case "equals":
    case "not_equals":
    case "contains":
    case "not_contains":
    case "starts_with":
    case "ends_with": {
      const test = createTextTest(resolved.op, resolved.value);
      return (cell) => test(toTextCell(cell));
    }
    default:
      return () => false;
  }
}

export function matchesFilter(
  field: BaseFieldDef,
  filter: Filter,
  cell: GridValue | undefined,
): boolean {
  return createFilterTest(field, filter)(cell);
}

export function listKeptValues(
  field: BaseFieldDef,
  filters: Filter[],
  values: string[],
): string[] {
  const tests = filters.map((filter) => createFilterTest(field, filter));
  return values.filter((value) => tests.every((test) => test(value)));
}

function firstValue(filter: Filter): string | null {
  if ("value" in filter) {
    return filter.value;
  }
  if ("min" in filter) {
    return filter.min;
  }
  if ("values" in filter) {
    return filter.values.find((value) => value !== null) ?? null;
  }
  return null;
}

// A control that changes operator keeps what it can of the value, so "between 5 and 9" turned into "greater than" is "greater than 5".
export function convertFilter(filter: Filter, op: FilterOp): Filter | null {
  const { field } = filter;
  if (filter.op === op) {
    return filter;
  }
  switch (getOperatorShape(op)) {
    case "none":
      return { field, op } as Filter;
    case "list": {
      const values = "values" in filter ? filter.values : [];
      const kept =
        op === "all_of" ? values.filter((value) => value !== null) : values;
      return kept.length > 0 ? ({ field, op, values: kept } as Filter) : null;
    }
    case "one": {
      const value = "values" in filter ? null : firstValue(filter);
      return value === null ? null : ({ field, op, value } as Filter);
    }
    case "pair": {
      if ("min" in filter) {
        return { field, op, min: filter.min, max: filter.max } as Filter;
      }
      const value = "value" in filter ? filter.value : null;
      return value === null
        ? null
        : ({ field, op, min: value, max: value } as Filter);
    }
    case "preset":
      return null;
  }
}
