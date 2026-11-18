import { describe, expect, test } from "bun:test";

import type { BaseFieldDef } from "./grid-def.ts";
import {
  formatCount,
  formatMoney,
  formatSum,
  formatValue,
  resolveCurrency,
} from "./format.ts";

const PRICE: BaseFieldDef = { key: "price", label: "Price", type: "money" };
const FEE: BaseFieldDef = { ...PRICE, key: "fee", currency: "EUR" };
const UNITS: BaseFieldDef = { key: "units", label: "Units", type: "integer" };
const TAGS: BaseFieldDef = { key: "tags", label: "Tags", type: "array" };

describe("formatting", () => {
  test("a field's currency wins over the host's, and neither is assumed", () => {
    expect(resolveCurrency(FEE, "USD")).toBe("EUR");
    expect(resolveCurrency(PRICE, "USD")).toBe("USD");
    expect(resolveCurrency(PRICE)).toBeUndefined();
  });

  test("money with no currency is a plain number with two fraction digits", () => {
    expect(formatValue(PRICE, 123400)).toBe("1,234.00");
    expect(formatValue(PRICE, 123456, "de-DE")).toBe("1.234,56");
    expect(formatSum(PRICE, 5, "en")).toBe("0.05");
    expect(formatMoney(123456)).toBe("1,234.56");
  });

  test("the locale is an argument and the currency is the field's or the host's", () => {
    expect(formatValue(PRICE, 123456, "en", "USD")).toBe("$1,234.56");
    expect(formatValue(FEE, 123456, "en", "USD")).toBe("€1,234.56");
    expect(formatValue(FEE, 123456, "de-DE")).toBe("1.234,56\u00a0€");
    expect(formatMoney(123456, "en-ZA", "ZAR")).toContain("234");
  });

  test("a sum is money in the field's currency, or a grouped number", () => {
    expect(formatSum(FEE, 123456, "de-DE")).toBe("1.234,56\u00a0€");
    expect(formatSum(UNITS, 1234567, "de-DE")).toBe("1.234.567");
    expect(formatValue(UNITS, 1234567, "de-DE")).toBe("1.234.567");
    expect(formatCount(1234567)).toBe("1,234,567");
  });

  test("an integer and a list follow the locale's digits and separators", () => {
    expect(formatValue(UNITS, 137, "ar-EG")).toBe("١٣٧");
    expect(formatValue(TAGS, ["a", "b"])).toBe("a, b");
    expect(formatValue(TAGS, ["a", "b", "c"], "ar-EG")).toBe("a، وb، وc");
  });
});
