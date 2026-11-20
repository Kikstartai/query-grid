import type { DatePreset } from "./date-presets.ts";
import { fromDayBound } from "./filter-values.ts";
import {
  getField,
  isDateType,
  isDefaultSort,
  type BaseGridDef,
  type SortDirection,
  type SortState,
} from "./grid-def.ts";
import { formatValue, labelKey } from "./format.ts";
import { isCombineOr } from "./indexes.ts";
import type { FilterOp } from "./operators.ts";
import type { QueryAction } from "./query-actions.ts";
import {
  listFieldFilters,
  listThenBy,
  type Filter,
  type QueryState,
} from "./query-state.ts";

export interface ChipValue {
  value: string | null;
  text: string | null;
  clear: QueryAction;
}

export interface FieldChip {
  id: string;
  kind: "filter";
  field: string;
  op: FilterOp;
  operands: string[];
  preset: DatePreset | null;
  values: ChipValue[];
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
  then: SortState[];
  clear: QueryAction | null;
}

export interface CombineChip {
  id: string;
  kind: "combine";
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
  | FieldChip
  | CombineChip
  | SearchChip
  | SortChip;

interface ChipFormat {
  def: BaseGridDef;
  labels: Record<string, string>;
  locale: string | undefined;
  currency: string | undefined;
}

function formatOperand(
  format: ChipFormat,
  key: string,
  operand: string,
): string {
  const field = getField(format.def, key);
  if (!field) {
    return operand;
  }
  if (isDateType(field.type)) {
    return fromDayBound(operand);
  }
  return formatValue(field, operand, format.locale, format.currency);
}

function formatChoice(format: ChipFormat, key: string, value: string): string {
  const field = getField(format.def, key);
  const known = format.labels[labelKey(key, value)];
  if (known) {
    return known;
  }
  return field
    ? formatValue(field, value, format.locale, format.currency)
    : value;
}

function listOperands(filter: Filter): string[] {
  if ("value" in filter) {
    return [filter.value];
  }
  if ("min" in filter) {
    return [filter.min, filter.max];
  }
  return [];
}

function fieldChip(
  format: ChipFormat,
  query: QueryState,
  filter: Filter,
): FieldChip {
  const { field, op } = filter;
  const at = listFieldFilters(query, field).indexOf(filter);
  const id = `filter:${field}:${op}`;
  return {
    id: at === 0 ? id : `${id}:${at}`,
    kind: "filter",
    field,
    op,
    operands: listOperands(filter).map((operand) =>
      formatOperand(format, field, operand),
    ),
    preset: "preset" in filter ? filter.preset : null,
    values:
      "values" in filter
        ? filter.values.map((value) => ({
            value,
            text: value === null ? null : formatChoice(format, field, value),
            clear: { type: "removeFilterValue", field, at, value },
          }))
        : [],
    clear: { type: "removeFilter", field, at },
  };
}

export function listFilterChips(
  def: BaseGridDef,
  query: QueryState,
  labels: Record<string, string> = {},
  locale?: string,
  currency?: string,
): FilterChip[] {
  const format: ChipFormat = { def, labels, locale, currency };
  const chips: FilterChip[] = query.filters.map((filter) =>
    fieldChip(format, query, filter),
  );
  if (isCombineOr(query)) {
    chips.push({
      id: "combine",
      kind: "combine",
      clear: { type: "setCombine", combine: "and" },
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
    then: listThenBy(query),
    clear:
      isDefaultSort(def, query.sort) && listThenBy(query).length === 0
        ? null
        : { type: "setSort", ...def.defaultSort },
  });
  return chips;
}
