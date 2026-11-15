"use client";

import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";
import { useSyncExternalStore } from "react";

import {
  normalizeThemeChoice,
  THEME_STORAGE_KEY,
  type ThemeChoice,
} from "./theme";

interface ThemeOption {
  choice: ThemeChoice;
  label: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  { choice: "system", label: "System" },
  { choice: "light", label: "Light" },
  { choice: "dark", label: "Dark" },
];

const listeners = new Set<() => void>();

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = choice;
  }
  for (const listener of listeners) {
    listener();
  }
}

function chooseTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, choice);
    }
  } catch {}
  applyTheme(choice);
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      applyTheme(normalizeThemeChoice(event.newValue));
    }
  };
  listeners.add(onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getThemeChoice(): ThemeChoice {
  return normalizeThemeChoice(document.documentElement.dataset.theme);
}

function getServerThemeChoice(): ThemeChoice {
  return "system";
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
  const choice = useSyncExternalStore(
    subscribe,
    getThemeChoice,
    getServerThemeChoice,
  );
  return (
    <SegmentedControl
      aria-label="Theme"
      data-part="theme-toggle"
      value={choice}
      onValueChange={(next: string | null) => {
        if (next !== null) {
          chooseTheme(normalizeThemeChoice(next));
        }
      }}
    >
      <ThemeToggleIndicator />
      {THEME_OPTIONS.map((option) => (
        <SegmentedControlItem
          key={option.choice}
          value={option.choice}
          data-theme-choice={option.choice}
        >
          {option.label}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}
