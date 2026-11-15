import type { BaseFieldDef } from "./field-types.ts";

export const EMPTY_VALUE = "_empty";
export const NOT_EMPTY_VALUE = "_not_empty";
export const EMPTY_MIXES = true;

export type ReservedValue = "empty" | "not_empty";

export function getReservedValue(
  field: BaseFieldDef,
  value: string,
): ReservedValue | null {
  if (!field.nullable) {
    return null;
  }
  if (value === EMPTY_VALUE) {
    return "empty";
  }
  return value === NOT_EMPTY_VALUE ? "not_empty" : null;
}

export function listReservedValues(field: BaseFieldDef): string[] {
  return field.nullable ? [EMPTY_VALUE, NOT_EMPTY_VALUE] : [];
}

function standsAlone(field: BaseFieldDef, value: string): boolean {
  const reserved = getReservedValue(field, value);
  return reserved === "not_empty" || (reserved === "empty" && !EMPTY_MIXES);
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
  value: string | number | null | undefined,
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
