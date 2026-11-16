import { describe, expect, test } from "bun:test";

import { TEST_DEF } from "./grid-def.fixture.ts";
import type { BaseGridDef } from "./grid-def.ts";
import { resolveLimits } from "./limits.ts";
import { isValidFieldValue } from "./query-validate.ts";

const DEF: BaseGridDef = {
  ...TEST_DEF,
  fields: [...TEST_DEF.fields, { key: "due", label: "Due", type: "date" }],
};

describe("a value Postgres would refuse never reaches it", () => {
  test("an instant is an ISO date with an optional time and zone", () => {
    const valid = [
      "2026-03-01",
      "2026-03-01T10:15",
      "2026-03-01T10:15:30Z",
      "2026-03-01T10:15:30.123456Z",
      "2026-03-01 10:15:30+02:00",
    ];
    for (const value of valid) {
      expect(isValidFieldValue(DEF, "created_at", value)).toBe(true);
    }
    const invalid = [
      "1",
      "a 1",
      "March 1, 2026",
      "2023-02-31T00:00:00Z",
      "0000-01-01T00:00:00Z",
      "2026-03-01T10:15:30Z; DROP",
    ];
    for (const value of invalid) {
      expect(isValidFieldValue(DEF, "created_at", value)).toBe(false);
    }
  });

  test("a day is a real day in a year Postgres has", () => {
    expect(isValidFieldValue(DEF, "due", "2026-03-01")).toBe(true);
    expect(isValidFieldValue(DEF, "due", "0000-01-01")).toBe(false);
    expect(isValidFieldValue(DEF, "due", "2026-02-31")).toBe(false);
  });

  test("text never carries a NUL byte", () => {
    expect(isValidFieldValue(DEF, "name", "Ann")).toBe(true);
    expect(isValidFieldValue(DEF, "name", "An\u0000n")).toBe(false);
  });
});

describe("the export limit", () => {
  test("zero turns export off, and no other limit may be zero", () => {
    expect(resolveLimits({ exportLimit: 0 }).exportLimit).toBe(0);
    expect(() => resolveLimits({ exportLimit: -1 })).toThrow("exportLimit");
    expect(() => resolveLimits({ countCap: 0 })).toThrow("countCap");
  });
});
