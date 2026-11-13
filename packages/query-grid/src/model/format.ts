import {
  getField,
  getFieldLabel,
  isDefaultSort,
  type FieldDef,
  type GridDef,
  type GridFormat,
  type QueryState,
} from "./field-types.ts";
import type { QueryAction } from "./query-actions.ts";

interface Formatters {
  dateTime: Intl.DateTimeFormat;
  money: Intl.NumberFormat;
  integer: Intl.NumberFormat;
}

const DEFAULT_LOCALE = "en-US";
const DEFAULT_CURRENCY = "USD";
const cache = new Map<string, Formatters>();

function resolveFormatters(format: GridFormat | undefined): Formatters {
  const locale = format?.locale ?? DEFAULT_LOCALE;
  const currency = format?.currency ?? DEFAULT_CURRENCY;
  const key = `${locale}|${currency}`;
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }
  const created: Formatters = {
    dateTime: new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    money: new Intl.NumberFormat(locale, { style: "currency", currency }),
    integer: new Intl.NumberFormat(locale),
  };
  cache.set(key, created);
  return created;
}

export function formatCount(count: number, format?: GridFormat): string {
  return resolveFormatters(format).integer.format(count);
}

export function formatRows(count: number, format?: GridFormat): string {
  return `${formatCount(count, format)} ${count === 1 ? "row" : "rows"}`;
}

export function formatLoaded(
  rows: number,
  pages: number,
  format?: GridFormat,
): string {
  return `${formatRows(rows, format)} loaded in ${pages} keyset ${pages === 1 ? "page" : "pages"}`;
}

export function formatMoney(cents: number, format?: GridFormat): string {
  return resolveFormatters(format).money.format(cents / 100);
}

export function formatValue(
  field: FieldDef,
  value: string | number | null,
  format?: GridFormat,
): string {
  if (value === null || value === "") {
    return "";
  }
  switch (field.type) {
    case "datetime": {
      const date = new Date(String(value));
      return Number.isNaN(date.getTime())
        ? String(value)
        : resolveFormatters(format).dateTime.format(date);
    }
    case "money":
      return formatMoney(Number(value), format);
    case "integer":
      return String(value);
    case "enum":
      return (
        field.options?.find((option) => option.value === value)?.label ??
        String(value)
      );
    case "id":
    case "text":
      return String(value);
  }
}

export interface FilterChip {
  id: string;
  kind: "equals" | "range" | "quick" | "sort";
  label: string;
  clear: QueryAction | null;
}

export function labelKey(field: string, value: string): string {
  return `${field}:${value}`;
}

function formatBound(def: GridDef, key: string, bound: string | null): string {
  const field = getField(def, key);
  if (!field || bound === null) {
    return "…";
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
    ([key, value]) => ({
      id: `eq:${key}`,
      kind: "equals",
      label: `${getFieldLabel(def, key)}: ${formatEquals(def, key, value, labels)}`,
      clear: { type: "clearEquals", field: key },
    }),
  );
  if (query.range) {
    const { field, min, max } = query.range;
    chips.push({
      id: `range:${field}`,
      kind: "range",
      label: `${getFieldLabel(def, field)}: ${formatBound(def, field, min)} – ${formatBound(def, field, max)}`,
      clear: { type: "clearRange" },
    });
  }
  if (query.quick !== null) {
    chips.push({
      id: "quick",
      kind: "quick",
      label: `Quick filter: “${query.quick}”`,
      clear: { type: "clearQuick" },
    });
  }
  chips.push({
    id: "sort",
    kind: "sort",
    label: `Sort: ${getFieldLabel(def, query.sort.field)} ${query.sort.direction === "asc" ? "↑" : "↓"}`,
    clear: isDefaultSort(def, query.sort)
      ? null
      : { type: "setSort", ...def.defaultSort },
  });
  return chips;
}
