import {
  getField,
  type FieldDef,
  type GridDef,
  type QueryState,
} from "./field-types.ts";

export const QUICK_MIN_LENGTH = 3;
export const QUICK_MAX_LENGTH = 80;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTEGER = /^-?\d{1,15}$/;

function isValidValue(field: FieldDef, value: string): boolean {
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

function checkValue(def: GridDef, key: string, value: string): string | null {
  const field = getField(def, key);
  if (!field) {
    return `unknown field ${key}`;
  }
  return isValidValue(field, value) ? null : `invalid value for ${key}`;
}

export function isValidFieldValue(
  def: GridDef,
  key: string,
  value: string,
): boolean {
  return checkValue(def, key, value) === null;
}

export function isValidQuickValue(value: string): boolean {
  const length = value.trim().length;
  return length >= QUICK_MIN_LENGTH && length <= QUICK_MAX_LENGTH;
}

export function validateQueryValues(
  def: GridDef,
  query: QueryState,
): string | null {
  for (const [key, value] of Object.entries(query.equals)) {
    const problem = checkValue(def, key, value);
    if (problem) {
      return problem;
    }
  }
  if (query.range) {
    for (const bound of [query.range.min, query.range.max]) {
      const problem =
        bound === null ? null : checkValue(def, query.range.field, bound);
      if (problem) {
        return problem;
      }
    }
  }
  if (query.quick !== null && !isValidQuickValue(query.quick)) {
    return `the quick filter needs ${QUICK_MIN_LENGTH} to ${QUICK_MAX_LENGTH} characters`;
  }
  if (query.sort.direction !== "asc" && query.sort.direction !== "desc") {
    return "invalid sort direction";
  }
  return null;
}
