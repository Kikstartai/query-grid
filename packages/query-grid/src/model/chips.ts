import {
  getField,
  isDateType,
  isDefaultSort,
  type BaseGridDef,
  type SortDirection,
} from "./grid-def.ts";
import {
  listRanges,
  type QueryState,
  type RangeState,
  type TextOp,
} from "./query-state.ts";
import {
  getReservedValue,
  isExcluding,
  listSelectedValues,
  type ReservedValue,
} from "./field-values.ts";
import { formatValue, labelKey } from "./format.ts";
import { isMatchAny } from "./indexes.ts";
import type { QueryAction } from "./query-actions.ts";
import { fromDayBound, toRangeValue, type RangeOp } from "./range-bounds.ts";

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
  op: RangeOp | null;
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

export interface TextChip {
  id: string;
  kind: "text";
  field: string;
  op: TextOp;
  value: string;
  clear: QueryAction;
}

export interface OverlapChip {
  id: string;
  kind: "overlap";
  field: string;
  values: ChipValue[];
  clear: QueryAction;
}

export interface MatchChip {
  id: string;
  kind: "match";
  clear: QueryAction;
}

export interface GroupChip {
  id: string;
  kind: "group";
  field: string;
  clear: QueryAction;
}

export type FilterChip =
  | GroupChip
  | EqualsChip
  | RangeChip
  | TextChip
  | OverlapChip
  | MatchChip
  | SearchChip
  | SortChip;

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
  if (isDateType(field.type)) {
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

function rangeChip(
  def: BaseGridDef,
  query: QueryState,
  range: RangeState,
  locale: string | undefined,
): RangeChip {
  const { field } = range;
  const at = listRanges(query, field).indexOf(range);
  const target = getField(def, field);
  const value = target ? toRangeValue(target, range) : null;
  return {
    id: at === 0 ? `range:${field}` : `range:${field}:${at}`,
    kind: "range",
    field,
    min: formatBound(def, field, value?.first ?? range.min, locale),
    max: formatBound(def, field, value ? value.second : range.max, locale),
    preset: range.preset ?? null,
    op: value?.op ?? null,
    clear: { type: "clearRange", field, at },
  };
}

function overlapChip(
  def: BaseGridDef,
  key: string,
  values: string[],
  labels: Record<string, string>,
  locale: string | undefined,
): OverlapChip {
  return {
    id: `overlap:${key}`,
    kind: "overlap",
    field: key,
    values: values.map((value) => ({
      value,
      text: formatEquals(def, key, value, labels, locale),
      reserved: null,
      clear: { type: "removeOverlapValue", field: key, value },
    })),
    clear: { type: "clearOverlap", field: key },
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
  for (const [field, values] of Object.entries(query.overlaps)) {
    chips.push(overlapChip(def, field, values, labels, locale));
  }
  for (const range of query.ranges) {
    chips.push(rangeChip(def, query, range, locale));
  }
  query.texts.forEach((text, at) => {
    chips.push({
      id: `text:${at}`,
      kind: "text",
      field: text.field,
      op: text.op,
      value: text.value,
      clear: { type: "removeText", at },
    });
  });
  if (isMatchAny(query)) {
    chips.push({
      id: "match",
      kind: "match",
      clear: { type: "setMatch", mode: "all" },
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
  if (query.group !== null) {
    chips.push({
      id: "group",
      kind: "group",
      field: query.group,
      clear: { type: "setGroup", field: null },
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
