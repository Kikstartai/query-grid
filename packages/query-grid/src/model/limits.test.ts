import { describe, expect, test } from "bun:test";

import { DEFAULT_LIMITS, PAGE_LIMIT_MAX, resolveLimits } from "./limits.ts";

describe("resolveLimits", () => {
  test("nothing passed keeps every default", () => {
    expect(resolveLimits()).toEqual(DEFAULT_LIMITS);
    expect(resolveLimits({})).not.toBe(DEFAULT_LIMITS);
  });

  test("an override replaces its own limit only", () => {
    expect(resolveLimits({ countCap: 500, searchBudgetMs: 300 })).toEqual({
      ...DEFAULT_LIMITS,
      countCap: 500,
      searchBudgetMs: 300,
    });
  });

  test("a limit that is not a positive integer is refused", () => {
    expect(() => resolveLimits({ countCap: 0 })).toThrow("countCap");
    expect(() => resolveLimits({ searchLimit: 1.5 })).toThrow("searchLimit");
    expect(() => resolveLimits({ narrowLimit: Number.NaN })).toThrow(
      "narrowLimit",
    );
  });

  test("the default page size cannot pass the page maximum", () => {
    expect(() => resolveLimits({ pageLimit: PAGE_LIMIT_MAX + 1 })).toThrow(
      "pageLimit",
    );
    expect(resolveLimits({ pageLimit: PAGE_LIMIT_MAX }).pageLimit).toBe(
      PAGE_LIMIT_MAX,
    );
  });
});
