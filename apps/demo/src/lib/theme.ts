export type ThemeChoice = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "query-grid:theme";

export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}`;

export function normalizeThemeChoice(value: unknown): ThemeChoice {
  if (value === "light" || value === "dark") {
    return value;
  }
  return "system";
}
