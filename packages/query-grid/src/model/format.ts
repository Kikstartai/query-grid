import type { BaseFieldDef, GridValue } from "./grid-def.ts";

export const DEFAULT_LOCALE = "en";
export const DEFAULT_CURRENCY = "USD";

const dateTimes = new Map<string, Intl.DateTimeFormat>();
const dates = new Map<string, Intl.DateTimeFormat>();
const decimals = new Map<string, Intl.NumberFormat>();
const LIST_SEPARATOR = ", ";
const DECIMAL_DIGITS = 9;
const integers = new Map<string, Intl.NumberFormat>();
const moneys = new Map<string, Intl.NumberFormat>();

function cached<T>(cache: Map<string, T>, key: string, create: () => T): T {
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }
  const created = create();
  cache.set(key, created);
  return created;
}

export function resolveCurrency(field: BaseFieldDef): string {
  return field.currency ?? DEFAULT_CURRENCY;
}

export function isCurrencyCode(code: string): boolean {
  try {
    new Intl.NumberFormat(DEFAULT_LOCALE, {
      style: "currency",
      currency: code,
    });
    return true;
  } catch {
    return false;
  }
}

export function formatCount(count: number, locale = DEFAULT_LOCALE): string {
  return cached(integers, locale, () => new Intl.NumberFormat(locale)).format(
    count,
  );
}

export function formatMoney(
  cents: number,
  locale = DEFAULT_LOCALE,
  currency = DEFAULT_CURRENCY,
): string {
  return cached(
    moneys,
    `${locale}|${currency}`,
    () => new Intl.NumberFormat(locale, { style: "currency", currency }),
  ).format(cents / 100);
}

function formatDateTime(date: Date, locale: string): string {
  return cached(
    dateTimes,
    locale,
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
  ).format(date);
}

function formatDate(date: Date, locale: string): string {
  return cached(
    dates,
    locale,
    () =>
      new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }),
  ).format(date);
}

function formatDecimal(value: number, locale: string): string {
  return cached(
    decimals,
    locale,
    () =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: DECIMAL_DIGITS }),
  ).format(value);
}

function formatOption(field: BaseFieldDef, value: string): string {
  return (
    field.options?.find((option) => option.value === value)?.label ?? value
  );
}

export function formatSum(
  field: BaseFieldDef,
  sum: number,
  locale = DEFAULT_LOCALE,
): string {
  return field.type === "money"
    ? formatMoney(sum, locale, resolveCurrency(field))
    : formatCount(sum, locale);
}

export function formatValue(
  field: BaseFieldDef,
  value: GridValue,
  locale = DEFAULT_LOCALE,
): string {
  if (value === null || value === "") {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatOption(field, item)).join(LIST_SEPARATOR);
  }
  switch (field.type) {
    case "date": {
      const date = new Date(String(value));
      return Number.isNaN(date.getTime())
        ? String(value)
        : formatDate(date, locale);
    }
    case "decimal":
      return Number.isNaN(Number(value))
        ? String(value)
        : formatDecimal(Number(value), locale);
    case "datetime": {
      const date = new Date(String(value));
      return Number.isNaN(date.getTime())
        ? String(value)
        : formatDateTime(date, locale);
    }
    case "money":
      return formatMoney(Number(value), locale, resolveCurrency(field));
    case "integer":
      return String(value);
    case "enum":
    case "array":
      return formatOption(field, String(value));
    case "id":
    case "text":
    case "boolean":
      return String(value);
  }
}

export function labelKey(field: string, value: string): string {
  return `${field}:${value}`;
}
