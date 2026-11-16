import {
  getField,
  resolveMaxValues,
  type BaseFieldDef,
  type BaseGridDef,
} from "./grid-def.ts";
import {
  RANGE_FILTER_MAX,
  TEXT_FILTER_MAX,
  TEXT_MAX_LENGTH,
  TEXT_OPS,
  type QueryState,
  type RangeState,
  type TextState,
} from "./query-state.ts";
import { canCombineValues, getReservedValue } from "./field-values.ts";
import { isOverlapField, isTextField } from "./indexes.ts";
import type { Problem } from "./problems.ts";

export const SEARCH_MIN_LENGTH = 3;
export const SEARCH_MAX_LENGTH = 80;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTEGER = /^-?\d{1,15}$/;
const DECIMAL = /^-?\d{1,15}(\.\d{1,9})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TEXT_VALUE_MAX = 200;

function isValidText(value: string): boolean {
  return value.length > 0 && value.length <= TEXT_VALUE_MAX;
}

// Date.parse rolls 02-31 over into March, which Postgres refuses, so a day counts only when it reads back as itself.
function isCalendarDay(value: string): boolean {
  const time = Date.parse(value);
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
}

function isValidValue(field: BaseFieldDef, value: string): boolean {
  switch (field.type) {
    case "id":
      return UUID.test(value);
    case "enum":
      return field.options?.some((option) => option.value === value) ?? false;
    case "integer":
    case "money":
      return INTEGER.test(value);
    case "decimal":
      return DECIMAL.test(value);
    case "boolean":
      return value === "true" || value === "false";
    case "date":
      return DAY.test(value) && isCalendarDay(value);
    case "datetime":
      return value.length <= 40 && !Number.isNaN(Date.parse(value));
    case "text":
    case "array":
      return isValidText(value);
  }
}

function invalid(field: string): Problem {
  return { code: "invalid_value", params: { field } };
}

function unknown(field: string): Problem {
  return { code: "unknown_field", params: { field } };
}

function checkValue(
  def: BaseGridDef,
  key: string,
  value: string,
): Problem | null {
  const field = getField(def, key);
  if (!field) {
    return unknown(key);
  }
  return isValidValue(field, value) ? null : invalid(key);
}

function areValidEquals(field: BaseFieldDef, values: string[]): boolean {
  return (
    canCombineValues(field, values) &&
    values.every(
      (value) =>
        getReservedValue(field, value) !== null || isValidValue(field, value),
    )
  );
}

function checkValues(
  def: BaseGridDef,
  key: string,
  values: string[],
  overlap: boolean,
): Problem | null {
  const field = getField(def, key);
  if (!field) {
    return unknown(key);
  }
  if (values.length === 0 || isOverlapField(field) !== overlap) {
    return invalid(key);
  }
  const max = resolveMaxValues(field);
  if (values.length > max) {
    return { code: "too_many_values", params: { field: key, max } };
  }
  const valid = overlap
    ? values.every(isValidText)
    : areValidEquals(field, values);
  return valid ? null : invalid(key);
}

function checkRange(def: BaseGridDef, range: RangeState): Problem | null {
  const unbounded = range.min === null && range.max === null;
  if (range.preset !== undefined || (range.exclude && unbounded)) {
    return invalid(range.field);
  }
  for (const bound of [range.min, range.max]) {
    const problem = bound === null ? null : checkValue(def, range.field, bound);
    if (problem) {
      return problem;
    }
  }
  return getField(def, range.field) ? null : unknown(range.field);
}

function checkText(def: BaseGridDef, text: TextState): Problem | null {
  const target = getField(def, text.field);
  if (!target) {
    return unknown(text.field);
  }
  const length = text.value.trim().length;
  const valid =
    isTextField(target) &&
    TEXT_OPS.includes(text.op) &&
    length > 0 &&
    length <= TEXT_MAX_LENGTH;
  return valid ? null : invalid(text.field);
}

function getFirstProblem<T>(
  items: T[],
  check: (item: T) => Problem | null,
): Problem | null {
  for (const item of items) {
    const problem = check(item);
    if (problem) {
      return problem;
    }
  }
  return null;
}

export function isValidFieldValue(
  def: BaseGridDef,
  key: string,
  value: string,
): boolean {
  return checkValue(def, key, value) === null;
}

export function isValidSearchValue(value: string): boolean {
  const length = value.trim().length;
  return length >= SEARCH_MIN_LENGTH && length <= SEARCH_MAX_LENGTH;
}

function checkFilters(def: BaseGridDef, query: QueryState): Problem | null {
  if (query.ranges.length > RANGE_FILTER_MAX) {
    return {
      code: "too_many_filters",
      params: { max: RANGE_FILTER_MAX },
    };
  }
  if (query.texts.length > TEXT_FILTER_MAX) {
    return { code: "too_many_filters", params: { max: TEXT_FILTER_MAX } };
  }
  return (
    getFirstProblem(Object.entries(query.equals), ([key, values]) =>
      checkValues(def, key, values, false),
    ) ??
    getFirstProblem(Object.entries(query.overlaps), ([key, values]) =>
      checkValues(def, key, values, true),
    ) ??
    getFirstProblem(query.ranges, (range) => checkRange(def, range)) ??
    getFirstProblem(query.texts, (text) => checkText(def, text))
  );
}

export function validateQueryValues(
  def: BaseGridDef,
  query: QueryState,
): Problem | null {
  const problem = checkFilters(def, query);
  if (problem) {
    return problem;
  }
  if (query.group !== null && !getField(def, query.group)) {
    return unknown(query.group);
  }
  if (query.match !== "all" && query.match !== "any") {
    return invalid("match");
  }
  if (query.search !== null && !isValidSearchValue(query.search)) {
    return {
      code: "search_length",
      params: { min: SEARCH_MIN_LENGTH, max: SEARCH_MAX_LENGTH },
    };
  }
  if (query.sort.direction !== "asc" && query.sort.direction !== "desc") {
    return { code: "invalid_sort_direction", params: {} };
  }
  return null;
}
