import type { BaseFieldDef, GridFormat } from "./field-types.ts";

interface Formatters {
  dateTime: Intl.DateTimeFormat;
  money: Intl.NumberFormat;
  integer: Intl.NumberFormat;
}

export const DEFAULT_LOCALE = "en-US";
export const DEFAULT_CURRENCY = "USD";
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

export function formatMoney(cents: number, format?: GridFormat): string {
  return resolveFormatters(format).money.format(cents / 100);
}

export function formatValue(
  field: BaseFieldDef,
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

export function labelKey(field: string, value: string): string {
  return `${field}:${value}`;
}
