import { isDateType, type BaseFieldDef } from "./field-types.ts";
import type { RangeInput } from "./query-actions.ts";

const DAY_LENGTH = 10;

export function toDayBound(day: string, end: boolean): string {
  return `${day}T${end ? "23:59:59.999999" : "00:00:00.000000"}Z`;
}

export function toDateBound(
  field: BaseFieldDef,
  day: string,
  end: boolean,
): string {
  return field.type === "date" ? day : toDayBound(day, end);
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

export const RANGE_OPS = [
  "between",
  "not_between",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
] as const;

export type RangeOp = (typeof RANGE_OPS)[number];

export interface RangeValue {
  op: RangeOp;
  first: string | null;
  second: string | null;
}

const PAIR_OPS: RangeOp[] = ["between", "not_between"];

export function isPairRangeOp(op: RangeOp): boolean {
  return PAIR_OPS.includes(op);
}

function toBound(field: BaseFieldDef, value: string, end: boolean): string {
  return isDateType(field.type) ? toDateBound(field, value, end) : value;
}

function fromBound(field: BaseFieldDef, bound: string | null): string | null {
  if (bound === null) {
    return null;
  }
  return isDateType(field.type) ? fromDayBound(bound) : bound;
}

function resolveRangeOp(
  range: RangeInput,
  first: string | null,
  second: string | null,
): RangeOp {
  const same = first !== null && first === second;
  if (range.exclude) {
    return same ? "neq" : "not_between";
  }
  if (first !== null && second !== null) {
    return same && !range.minExclusive && !range.maxExclusive
      ? "eq"
      : "between";
  }
  if (first !== null) {
    return range.minExclusive ? "gt" : "gte";
  }
  return range.maxExclusive ? "lt" : "lte";
}

// A date bound is read back as its day, so "after the 3rd" and "on the 3rd" both show the 3rd, each under its own operator.
export function toRangeValue(
  field: BaseFieldDef,
  range: RangeInput | null,
): RangeValue | null {
  if (!range || range.preset !== undefined) {
    return null;
  }
  const first = fromBound(field, range.min);
  const second = fromBound(field, range.max);
  if (first === null && second === null) {
    return null;
  }
  const op = resolveRangeOp(range, first, second);
  return isPairRangeOp(op)
    ? { op, first, second }
    : { op, first: first ?? second, second: null };
}

export function fromRangeValue(
  field: BaseFieldDef,
  { op, first, second }: RangeValue,
): RangeInput | null {
  if (first === null && (second === null || !isPairRangeOp(op))) {
    return null;
  }
  const low = first === null ? null : toBound(field, first, false);
  const high = first === null ? null : toBound(field, first, true);
  switch (op) {
    case "between":
    case "not_between": {
      const max = second === null ? null : toBound(field, second, true);
      return op === "between"
        ? { min: low, max }
        : { min: low, max, exclude: true };
    }
    case "eq":
      return { min: low, max: high };
    case "neq":
      return { min: low, max: high, exclude: true };
    case "gt":
      return { min: high, max: null, minExclusive: true };
    case "gte":
      return { min: low, max: null };
    case "lt":
      return { min: null, max: low, maxExclusive: true };
    case "lte":
      return { min: null, max: high };
  }
}

function asPair(value: RangeValue, op: RangeOp): RangeValue | null {
  const { first } = value;
  if (op === "not_between") {
    return value.op === "neq" ? { op, first, second: first } : null;
  }
  switch (value.op) {
    case "gte":
      return { op, first, second: null };
    case "lte":
      return { op, first: null, second: first };
    case "eq":
      return { op, first, second: first };
    default:
      return null;
  }
}

// One range has several readings (from 5 with no end is also "≥ 5"), so a control that has an operator picked keeps it while the range still says the same thing.
export function resolveRangeValue(
  field: BaseFieldDef,
  range: RangeInput | null,
  preferred: RangeOp | null,
): RangeValue | null {
  const value = toRangeValue(field, range);
  if (!value || preferred === null || value.op === preferred) {
    return value;
  }
  return (isPairRangeOp(preferred) ? asPair(value, preferred) : null) ?? value;
}
