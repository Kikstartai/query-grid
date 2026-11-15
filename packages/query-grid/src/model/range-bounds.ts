import type { BaseFieldDef } from "./field-types.ts";

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
