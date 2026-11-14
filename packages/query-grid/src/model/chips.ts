import {
  getField,
  isDefaultSort,
  type GridDef,
  type QueryState,
  type SortDirection,
} from "./field-types.ts";
import { formatValue, labelKey } from "./format.ts";
import type { QueryAction } from "./query-actions.ts";

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

export interface QuickChip {
  id: string;
  kind: "quick";
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

export type FilterChip = EqualsChip | RangeChip | QuickChip | SortChip;

function formatBound(
  def: GridDef,
  key: string,
  bound: string | null,
): string | null {
  const field = getField(def, key);
  if (!field || bound === null) {
    return null;
  }
  if (field.type === "datetime") {
    return bound.slice(0, 10);
  }
  return formatValue(field, bound, def.format);
}

function formatEquals(
  def: GridDef,
  key: string,
  value: string,
  labels: Record<string, string>,
): string {
  const field = getField(def, key);
  const known = labels[labelKey(key, value)];
  if (known) {
    return known;
  }
  return field ? formatValue(field, value, def.format) : value;
}

export function listFilterChips(
  def: GridDef,
  query: QueryState,
  labels: Record<string, string> = {},
): FilterChip[] {
  const chips: FilterChip[] = Object.entries(query.equals).map(
    ([field, values]) => ({
      id: `eq:${field}`,
      kind: "equals",
      field,
      values: values.map((value) => ({
        value,
        text: formatEquals(def, field, value, labels),
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
      min: formatBound(def, field, min),
      max: formatBound(def, field, max),
      clear: { type: "clearRange" },
    });
  }
  if (query.quick !== null) {
    chips.push({
      id: "quick",
      kind: "quick",
      value: query.quick,
      clear: { type: "clearQuick" },
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
