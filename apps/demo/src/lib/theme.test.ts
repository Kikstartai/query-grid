import { describe, expect, test } from "bun:test";

import { normalizeThemeChoice, THEME_SCRIPT, THEME_STORAGE_KEY } from "./theme";

function runThemeScript(stored: string | null, throws = false) {
  const dataset: Record<string, string> = {};
  const localStorage = {
    getItem(key: string) {
      if (throws) {
        throw new Error("blocked");
      }
      return key === THEME_STORAGE_KEY ? stored : null;
    },
  };
  const document = { documentElement: { dataset } };
  new Function("localStorage", "document", THEME_SCRIPT)(
    localStorage,
    document,
  );
  return dataset.theme;
}

describe("theme", () => {
  test("normalizeThemeChoice keeps light and dark and falls back to system", () => {
    expect(normalizeThemeChoice("light")).toBe("light");
    expect(normalizeThemeChoice("dark")).toBe("dark");
    expect(normalizeThemeChoice("system")).toBe("system");
    expect(normalizeThemeChoice("blue")).toBe("system");
    expect(normalizeThemeChoice(null)).toBe("system");
  });

  test("the head script applies a stored choice and nothing else", () => {
    expect(runThemeScript("dark")).toBe("dark");
    expect(runThemeScript("light")).toBe("light");
    expect(runThemeScript("blue")).toBeUndefined();
    expect(runThemeScript(null)).toBeUndefined();
    expect(runThemeScript("dark", true)).toBeUndefined();
  });
});
