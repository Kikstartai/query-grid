import {
  getField,
  resolveMaxValues,
  type BaseFieldDef,
  type BaseGridDef,
  type QueryState,
} from "./field-types.ts";
import { canCombineValues, getReservedValue } from "./field-values.ts";
import type { Problem } from "./problems.ts";

export const SEARCH_MIN_LENGTH = 3;
export const SEARCH_MAX_LENGTH = 80;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTEGER = /^-?\d{1,15}$/;

function isValidValue(field: BaseFieldDef, value: string): boolean {
  switch (field.type) {
    case "id":
      return UUID.test(value);
    case "enum":
      return field.options?.some((option) => option.value === value) ?? false;
    case "integer":
    case "money":
      return INTEGER.test(value);
    case "datetime":
      return value.length <= 40 && !Number.isNaN(Date.parse(value));
    case "text":
      return value.length > 0 && value.length <= 200;
  }
}

function checkValue(
  def: BaseGridDef,
  key: string,
  value: string,
): Problem | null {
  const field = getField(def, key);
  if (!field) {
    return { code: "unknown_field", params: { field: key } };
  }
  return isValidValue(field, value)
    ? null
    : { code: "invalid_value", params: { field: key } };
}

function checkEquals(
  def: BaseGridDef,
  key: string,
  values: string[],
): Problem | null {
  const field = getField(def, key);
  if (!field) {
    return { code: "unknown_field", params: { field: key } };
  }
  if (values.length === 0) {
    return { code: "invalid_value", params: { field: key } };
  }
  const max = resolveMaxValues(field);
  if (values.length > max) {
    return { code: "too_many_values", params: { field: key, max } };
  }
  const valid =
    canCombineValues(field, values) &&
    values.every(
      (value) =>
        getReservedValue(field, value) !== null || isValidValue(field, value),
    );
  return valid ? null : { code: "invalid_value", params: { field: key } };
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

export function validateQueryValues(
  def: BaseGridDef,
  query: QueryState,
): Problem | null {
  for (const [key, values] of Object.entries(query.equals)) {
    const problem = checkEquals(def, key, values);
    if (problem) {
      return problem;
    }
  }
  const ranged = new Set<string>();
  for (const range of query.ranges) {
    if (range.preset !== undefined || ranged.has(range.field)) {
      return { code: "invalid_value", params: { field: range.field } };
    }
    ranged.add(range.field);
    for (const bound of [range.min, range.max]) {
      const problem =
        bound === null ? null : checkValue(def, range.field, bound);
      if (problem) {
        return problem;
      }
    }
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
