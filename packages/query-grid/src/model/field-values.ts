import {
  resolveMaxValues,
  type BaseFieldDef,
  type GridValue,
} from "./field-types.ts";

export const EMPTY_VALUE = "_empty";
export const NOT_EMPTY_VALUE = "_not_empty";
export const EXCLUDE_PREFIX = "!";

export type ReservedValue = "empty" | "not_empty";

// An array is filtered by the values it holds, so empty and not empty belong to the fields an equality reads.
function takesReservedValues(field: BaseFieldDef): boolean {
  return field.nullable === true && field.type !== "array";
}

export function getReservedValue(
  field: BaseFieldDef,
  value: string,
): ReservedValue | null {
  if (!takesReservedValues(field)) {
    return null;
  }
  if (value === EMPTY_VALUE) {
    return "empty";
  }
  return value === NOT_EMPTY_VALUE ? "not_empty" : null;
}

export function listReservedValues(field: BaseFieldDef): string[] {
  return takesReservedValues(field) ? [EMPTY_VALUE, NOT_EMPTY_VALUE] : [];
}

function standsAlone(field: BaseFieldDef, value: string): boolean {
  const reserved = getReservedValue(field, value);
  return reserved === "not_empty";
}

export function canCombineValues(
  field: BaseFieldDef,
  values: string[],
): boolean {
  return (
    values.length < 2 || !values.some((value) => standsAlone(field, value))
  );
}

export function normalizeEqualsValues(
  field: BaseFieldDef,
  previous: string[],
  next: string[],
): string[] {
  const added = next.filter((value) => !previous.includes(value));
  const alone = added.find((value) => standsAlone(field, value));
  if (alone !== undefined) {
    return [alone];
  }
  return added.length > 0
    ? next.filter((value) => !standsAlone(field, value))
    : next;
}

export function matchesEquals(
  field: BaseFieldDef | null,
  values: string[],
  value: GridValue | undefined,
): boolean {
  const empty = value === null || value === undefined;
  if (!field?.nullable) {
    return values.includes(String(value ?? ""));
  }
  if (empty) {
    return values.includes(EMPTY_VALUE);
  }
  return values.includes(NOT_EMPTY_VALUE) || values.includes(String(value));
}

export function isExcludable(field: BaseFieldDef): boolean {
  return field.options !== undefined && field.lookup === undefined;
}

export function isExcluding(field: BaseFieldDef, values: string[]): boolean {
  return (
    isExcludable(field) &&
    values.length > 0 &&
    values.every((value) => value.startsWith(EXCLUDE_PREFIX))
  );
}

export function toExcludeValues(values: string[]): string[] {
  return values.map((value) => `${EXCLUDE_PREFIX}${value}`);
}

export function fromExcludeValues(values: string[]): string[] {
  return values.map((value) => value.slice(EXCLUDE_PREFIX.length));
}

export function listSelectedValues(
  field: BaseFieldDef,
  values: string[],
): string[] {
  return isExcluding(field, values) ? fromExcludeValues(values) : values;
}

export function expandEquals(field: BaseFieldDef, values: string[]): string[] {
  if (!isExcluding(field, values)) {
    return values;
  }
  const excluded = fromExcludeValues(values);
  const kept = (field.options ?? [])
    .map((option) => option.value)
    .filter((value) => !excluded.includes(value));
  return field.nullable ? [...kept, EMPTY_VALUE] : kept;
}

export function canExpandEquals(
  field: BaseFieldDef,
  values: string[],
): boolean {
  const expanded = expandEquals(field, values).length;
  return expanded > 0 && expanded <= resolveMaxValues(field);
}
