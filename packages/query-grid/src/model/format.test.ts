import { describe, expect, test } from "bun:test";

import type { BaseFieldDef } from "./field-types.ts";
import { formatCount, formatMoney, formatSum, formatValue } from "./format.ts";

const PRICE: BaseFieldDef = { key: "price", label: "Price", type: "money" };
const FEE: BaseFieldDef = { ...PRICE, key: "fee", currency: "EUR" };
const UNITS: BaseFieldDef = { key: "units", label: "Units", type: "integer" };

describe("formatting", () => {
  test("the locale is an argument and the currency is the field's", () => {
    expect(formatValue(PRICE, 123456)).toBe("$1,234.56");
    expect(formatValue(FEE, 123456)).toBe("€1,234.56");
    expect(formatValue(FEE, 123456, "de-DE")).toBe("1.234,56\u00a0€");
    expect(formatMoney(123456, "en-ZA", "ZAR")).toContain("234");
  });

  test("a sum is money in the field's currency, or a grouped number", () => {
    expect(formatSum(FEE, 123456, "de-DE")).toBe("1.234,56\u00a0€");
    expect(formatSum(UNITS, 1234567, "de-DE")).toBe("1.234.567");
    expect(formatValue(UNITS, 1234567, "de-DE")).toBe("1234567");
    expect(formatCount(1234567)).toBe("1,234,567");
  });
});
