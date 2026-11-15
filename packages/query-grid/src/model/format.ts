import type { BaseFieldDef } from "./field-types.ts";

export const DEFAULT_LOCALE = "en";
export const DEFAULT_CURRENCY = "USD";

const dateTimes = new Map<string, Intl.DateTimeFormat>();
const integers = new Map<string, Intl.NumberFormat>();
const moneys = new Map<string, Intl.NumberFormat>();

function resolveCached<T>(
  cache: Map<string, T>,
  key: string,
  create: () => T,
): T {
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }
  const created = create();
  cache.set(key, created);
  return created;
}

export function formatCount(count: number, locale = DEFAULT_LOCALE): string {
  return resolveCached(
    integers,
    locale,
    () => new Intl.NumberFormat(locale),
  ).format(count);
}

export function formatMoney(
  cents: number,
  locale = DEFAULT_LOCALE,
  currency = DEFAULT_CURRENCY,
): string {
  return resolveCached(
    moneys,
    `${locale}|${currency}`,
    () => new Intl.NumberFormat(locale, { style: "currency", currency }),
  ).format(cents / 100);
}

function formatDateTime(date: Date, locale: string): string {
  return resolveCached(
    dateTimes,
    locale,
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
  ).format(date);
}

export function formatSum(
  field: BaseFieldDef,
  sum: number,
  locale = DEFAULT_LOCALE,
): string {
  return field.type === "money"
    ? formatMoney(sum, locale, field.currency)
    : formatCount(sum, locale);
}

export function formatValue(
  field: BaseFieldDef,
  value: string | number | null,
  locale = DEFAULT_LOCALE,
): string {
  if (value === null || value === "") {
    return "";
  }
  switch (field.type) {
    case "datetime": {
      const date = new Date(String(value));
      return Number.isNaN(date.getTime())
        ? String(value)
        : formatDateTime(date, locale);
    }
    case "money":
      return formatMoney(Number(value), locale, field.currency);
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
