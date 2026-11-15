"use client";

import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";
import { useSyncExternalStore } from "react";

import { normalizeTheme, THEME_STORAGE_KEY, type Theme } from "./theme";

interface ThemeOption {
  theme: Theme;
  label: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  { theme: "light", label: "Light" },
  { theme: "dark", label: "Dark" },
];

const SYSTEM_DARK = "(prefers-color-scheme: dark)";

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function applyTheme(theme: Theme | null) {
  const root = document.documentElement;
  if (theme === null) {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
  notify();
}

function chooseTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
  applyTheme(theme);
}

function onStorage(event: StorageEvent) {
  if (event.key === THEME_STORAGE_KEY || event.key === null) {
    applyTheme(normalizeTheme(event.newValue));
  }
}

function subscribe(onChange: () => void) {
  if (listeners.size === 0) {
    window.addEventListener("storage", onStorage);
    matchMedia(SYSTEM_DARK).addEventListener("change", notify);
  }
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      window.removeEventListener("storage", onStorage);
      matchMedia(SYSTEM_DARK).removeEventListener("change", notify);
    }
  };
}

function getTheme(): Theme {
  const chosen = normalizeTheme(document.documentElement.dataset.theme);
  if (chosen !== null) {
    return chosen;
  }
  return matchMedia(SYSTEM_DARK).matches ? "dark" : "light";
}

function getServerTheme(): Theme | null {
  return null;
}

function subscribeNothing() {
  return () => {};
}

function ThemeToggleIndicator() {
  // The indicator is measured in the browser, so one in the server HTML would jump to its item on hydration.
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  if (!mounted) {
    return null;
  }
  return <SegmentedControlIndicator />;
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);
  return (
    <SegmentedControl
      aria-label="Theme"
      data-part="theme-toggle"
      value={theme}
      onValueChange={(next: string | null) => {
        const chosen = normalizeTheme(next);
        if (chosen !== null) {
          chooseTheme(chosen);
        }
      }}
    >
      <ThemeToggleIndicator />
      {THEME_OPTIONS.map((option) => (
        <SegmentedControlItem
          key={option.theme}
          value={option.theme}
          data-theme-choice={option.theme}
        >
          {option.label}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}
