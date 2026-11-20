import {
  getField,
  resolveMaxValues,
  type BaseFieldDef,
  type BaseGridDef,
} from "./grid-def.ts";
import { isDatePreset } from "./date-presets.ts";
import {
  isFieldOp,
  isFilterOp,
  isLiteralOp,
  resolveFieldKind,
} from "./operators.ts";
import {
  FILTER_MAX,
  listSorts,
  SORT_MAX,
  TEXT_MAX_LENGTH,
  type Filter,
  type QueryState,
} from "./query-state.ts";
import type { Problem } from "./problems.ts";

export const SEARCH_MIN_LENGTH = 3;
export const SEARCH_MAX_LENGTH = 80;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTEGER = /^-?\d{1,15}$/;
const DECIMAL = /^-?\d{1,15}(\.\d{1,9})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?)?(Z|[+-]\d{2}(:?\d{2})?)?$/;
const DAY_LENGTH = 10;
const NUL = "\u0000";
const TEXT_VALUE_MAX = 200;

function isValidText(value: string): boolean {
  return (
    value.length > 0 && value.length <= TEXT_VALUE_MAX && !value.includes(NUL)
  );
}

// Date.parse rolls 02-31 over into March and takes a year 0, both of which Postgres refuses, so a day counts only when it reads back as itself in a year Postgres has.
function isCalendarDay(value: string): boolean {
  const time = Date.parse(value);
  return (
    !value.startsWith("0000") &&
    !Number.isNaN(time) &&
    new Date(time).toISOString().startsWith(value)
  );
}

function isInstant(value: string): boolean {
  return (
    INSTANT.test(value) &&
    isCalendarDay(value.slice(0, DAY_LENGTH)) &&
    !Number.isNaN(Date.parse(value))
  );
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
      return isInstant(value);
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

function isValidTextValue(value: string): boolean {
  const length = value.trim().length;
  return length > 0 && length <= TEXT_MAX_LENGTH && !value.includes(NUL);
}

function isValidOperand(field: BaseFieldDef, value: string): boolean {
  return resolveFieldKind(field) === "text"
    ? isValidTextValue(value)
    : isValidValue(field, value);
}

function checkList(
  field: BaseFieldDef,
  values: (string | null)[],
): Problem | null {
  if (values.length === 0) {
    return invalid(field.key);
  }
  const max = resolveMaxValues(field);
  if (values.length > max) {
    return { code: "too_many_values", params: { field: field.key, max } };
  }
  const valid = values.every((value) =>
    value === null ? field.nullable === true : isValidValue(field, value),
  );
  return valid ? null : invalid(field.key);
}

function checkOperands(field: BaseFieldDef, filter: Filter): Problem | null {
  if ("values" in filter) {
    return checkList(field, filter.values);
  }
  if ("value" in filter) {
    return isValidOperand(field, filter.value) ? null : invalid(field.key);
  }
  if ("min" in filter) {
    const valid =
      isValidOperand(field, filter.min) && isValidOperand(field, filter.max);
    return valid ? null : invalid(field.key);
  }
  if ("preset" in filter) {
    return isDatePreset(filter.preset) ? null : invalid(field.key);
  }
  return null;
}

function opProblem(code: string, filter: Filter): Problem {
  return { code, params: { field: filter.field, op: filter.op } };
}

// What a field takes is fixed by its type, so an operator outside it is refused before any index is asked, and an operator only the browser resolves is refused by name.
export function checkFilterOps(
  def: BaseGridDef,
  query: QueryState,
): Problem | null {
  if (query.filters.length > FILTER_MAX) {
    return { code: "too_many_filters", params: { max: FILTER_MAX } };
  }
  for (const filter of query.filters) {
    const field = getField(def, filter.field);
    if (!field) {
      continue;
    }
    if (!isFilterOp(filter.op) || !isFieldOp(field, filter.op)) {
      return opProblem("invalid_op", filter);
    }
    if (isLiteralOp(field, filter.op)) {
      return opProblem("literal_required", filter);
    }
  }
  return null;
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

function checkFilter(def: BaseGridDef, filter: Filter): Problem | null {
  const field = getField(def, filter.field);
  if (!field) {
    return unknown(filter.field);
  }
  if (!isFilterOp(filter.op) || !isFieldOp(field, filter.op)) {
    return opProblem("invalid_op", filter);
  }
  return checkOperands(field, filter);
}

function checkFilters(def: BaseGridDef, query: QueryState): Problem | null {
  if (query.filters.length > FILTER_MAX) {
    return { code: "too_many_filters", params: { max: FILTER_MAX } };
  }
  return getFirstProblem(query.filters, (filter) => checkFilter(def, filter));
}

function checkSorts(def: BaseGridDef, query: QueryState): Problem | null {
  const sorts = listSorts(query);
  if (sorts.length > SORT_MAX) {
    return { code: "too_many_sorts", params: { max: SORT_MAX } };
  }
  for (const sort of sorts) {
    if (sort.direction !== "asc" && sort.direction !== "desc") {
      return { code: "invalid_sort_direction", params: {} };
    }
  }
  const [, ...thenBy] = sorts.map((sort) => sort.field);
  const stray = thenBy.find((key) => !getField(def, key));
  if (stray !== undefined) {
    return unknown(stray);
  }
  const repeated = thenBy.find(
    (key, at) => key === query.sort.field || thenBy.indexOf(key) !== at,
  );
  return repeated === undefined ? null : invalid(repeated);
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
  if (query.combine !== "and" && query.combine !== "or") {
    return invalid("combine");
  }
  if (query.search !== null && !isValidSearchValue(query.search)) {
    return {
      code: "search_length",
      params: { min: SEARCH_MIN_LENGTH, max: SEARCH_MAX_LENGTH },
    };
  }
  return checkSorts(def, query);
}
