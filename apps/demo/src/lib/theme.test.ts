import { describe, expect, test } from "bun:test";

import { normalizeTheme, THEME_SCRIPT, THEME_STORAGE_KEY } from "./theme";

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
  test("normalizeTheme keeps light and dark and nothing else", () => {
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme("dark")).toBe("dark");
    expect(normalizeTheme("system")).toBeNull();
    expect(normalizeTheme("blue")).toBeNull();
    expect(normalizeTheme(null)).toBeNull();
  });

  test("the head script applies a stored choice and nothing else", () => {
    expect(runThemeScript("dark")).toBe("dark");
    expect(runThemeScript("light")).toBe("light");
    expect(runThemeScript("blue")).toBeUndefined();
    expect(runThemeScript(null)).toBeUndefined();
    expect(runThemeScript("dark", true)).toBeUndefined();
  });
});
