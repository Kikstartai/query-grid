import {
  getField,
  isDefaultSort,
  type BaseGridDef,
  type QueryState,
  type SortDirection,
} from "./field-types.ts";
import {
  getReservedValue,
  isExcluding,
  listSelectedValues,
  type ReservedValue,
} from "./field-values.ts";
import { formatValue, labelKey } from "./format.ts";
import type { QueryAction } from "./query-actions.ts";
import { fromDayBound } from "./range-bounds.ts";

export interface ChipValue {
  value: string;
  text: string;
  reserved: ReservedValue | null;
  clear: QueryAction;
}

export interface EqualsChip {
  id: string;
  kind: "equals";
  field: string;
  excluded: boolean;
  values: ChipValue[];
  clear: QueryAction;
}

export interface RangeChip {
  id: string;
  kind: "range";
  field: string;
  min: string | null;
  max: string | null;
  preset: string | null;
  clear: QueryAction;
}

export interface SearchChip {
  id: string;
  kind: "search";
  value: string;
  clear: QueryAction;
}

export interface SortChip {
  id: string;
  kind: "sort";
  field: string;
  direction: SortDirection;
  clear: QueryAction | null;
}

export type FilterChip = EqualsChip | RangeChip | SearchChip | SortChip;

function formatBound(
  def: BaseGridDef,
  key: string,
  bound: string | null,
  locale: string | undefined,
): string | null {
  const field = getField(def, key);
  if (!field || bound === null) {
    return null;
  }
  if (field.type === "datetime") {
    return fromDayBound(bound);
  }
  return formatValue(field, bound, locale);
}

function formatEquals(
  def: BaseGridDef,
  key: string,
  value: string,
  labels: Record<string, string>,
  locale: string | undefined,
): string {
  const field = getField(def, key);
  const known = labels[labelKey(key, value)];
  if (known) {
    return known;
  }
  return field ? formatValue(field, value, locale) : value;
}

function getChipReserved(
  def: BaseGridDef,
  key: string,
  value: string,
): ReservedValue | null {
  const field = getField(def, key);
  return field ? getReservedValue(field, value) : null;
}

function equalsChip(
  def: BaseGridDef,
  key: string,
  values: string[],
  labels: Record<string, string>,
  locale: string | undefined,
): EqualsChip {
  const field = getField(def, key);
  const excluded = field !== null && isExcluding(field, values);
  const shown = field ? listSelectedValues(field, values) : values;
  return {
    id: `eq:${key}`,
    kind: "equals",
    field: key,
    excluded,
    values: shown.map((value, index) => ({
      value,
      text: formatEquals(def, key, value, labels, locale),
      reserved: getChipReserved(def, key, value),
      clear: { type: "removeEqualsValue", field: key, value: values[index] },
    })),
    clear: { type: "clearEquals", field: key },
  };
}

export function listFilterChips(
  def: BaseGridDef,
  query: QueryState,
  labels: Record<string, string> = {},
  locale?: string,
): FilterChip[] {
  const chips: FilterChip[] = Object.entries(query.equals).map(
    ([field, values]) => equalsChip(def, field, values, labels, locale),
  );
  for (const { field, min, max, preset } of query.ranges) {
    chips.push({
      id: `range:${field}`,
      kind: "range",
      field,
      min: formatBound(def, field, min, locale),
      max: formatBound(def, field, max, locale),
      preset: preset ?? null,
      clear: { type: "clearRange", field },
    });
  }
  if (query.search !== null) {
    chips.push({
      id: "search",
      kind: "search",
      value: query.search,
      clear: { type: "clearSearch" },
    });
  }
  chips.push({
    id: "sort",
    kind: "sort",
    field: query.sort.field,
    direction: query.sort.direction,
    clear: isDefaultSort(def, query.sort)
      ? null
      : { type: "setSort", ...def.defaultSort },
  });
  return chips;
}
