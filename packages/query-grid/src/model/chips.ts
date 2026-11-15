import {
  getField,
  isDefaultSort,
  type BaseGridDef,
  type QueryState,
  type SortDirection,
} from "./field-types.ts";
import { formatValue, labelKey } from "./format.ts";
import type { QueryAction } from "./query-actions.ts";
import { fromDayBound } from "./range-bounds.ts";

export interface ChipValue {
  value: string;
  text: string;
  clear: QueryAction;
}

export interface EqualsChip {
  id: string;
  kind: "equals";
  field: string;
  values: ChipValue[];
  clear: QueryAction;
}

export interface RangeChip {
  id: string;
  kind: "range";
  field: string;
  min: string | null;
  max: string | null;
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

export function listFilterChips(
  def: BaseGridDef,
  query: QueryState,
  labels: Record<string, string> = {},
  locale?: string,
): FilterChip[] {
  const chips: FilterChip[] = Object.entries(query.equals).map(
    ([field, values]) => ({
      id: `eq:${field}`,
      kind: "equals",
      field,
      values: values.map((value) => ({
        value,
        text: formatEquals(def, field, value, labels, locale),
        clear: { type: "removeEqualsValue", field, value },
      })),
      clear: { type: "clearEquals", field },
    }),
  );
  if (query.range) {
    const { field, min, max } = query.range;
    chips.push({
      id: `range:${field}`,
      kind: "range",
      field,
      min: formatBound(def, field, min, locale),
      max: formatBound(def, field, max, locale),
      clear: { type: "clearRange" },
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
