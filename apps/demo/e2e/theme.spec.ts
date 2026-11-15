import type { Page } from "@playwright/test";

import { bar, expect, test } from "./fixtures";
import {
  contrast,
  firstFrameProbe,
  paint,
  SCHEMES,
  THEME_PAGES,
  type Scheme,
} from "./theme";

const STORAGE_KEY = "query-grid:theme";

async function settle(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-skeleton]")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
}

async function expectAA(page: Page) {
  const result = await contrast(page);
  expect(result.texts).toBeGreaterThan(0);
  expect(result.low, `texts below AA (min ${result.min})`).toEqual([]);
}

function pressed(page: Page) {
  return page.locator(
    '[data-part=theme-toggle] [data-theme-choice][aria-checked="true"]',
  );
}

test.describe("no flash of the wrong theme", () => {
  const cases: [Scheme, string | null, string, Scheme][] = [
    ["dark", null, "none", "dark"],
    ["light", "dark", "dark", "dark"],
    ["dark", "light", "light", "light"],
  ];
  for (const [scheme, stored, theme, body] of cases) {
    test(`OS ${scheme}, ${stored ?? "no"} choice paints ${body} in the first frame`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.addInitScript(
        ([key, value]) => {
          if (value) {
            localStorage.setItem(key, value);
          }
        },
        [STORAGE_KEY, stored] as const,
      );
      await page.addInitScript(firstFrameProbe);
      await page.goto("/orders");
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as unknown as { __firstFrame?: unknown }).__firstFrame ??
              null,
          ),
        )
        .toEqual({ theme, body });
    });
  }
});

test("the toggle starts on the system theme and follows it until a choice", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await settle(page, "/orders");
  await expect(
    page.locator("[data-part=theme-toggle] [data-theme-choice]"),
  ).toHaveCount(2);
  await expect(pressed(page)).toHaveAttribute("data-theme-choice", "light");
  expect(await paint(page)).toEqual({ theme: "none", body: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(pressed(page)).toHaveAttribute("data-theme-choice", "dark");
  await expect.poll(() => paint(page)).toEqual({ theme: "none", body: "dark" });
});

test("the toggle persists across a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await settle(page, "/orders");

  const steps: [Scheme, Scheme][] = [
    ["dark", "light"],
    ["light", "dark"],
  ];
  for (const [choice, os] of steps) {
    await page
      .locator(`[data-part=theme-toggle] [data-theme-choice=${choice}]`)
      .click();
    await expect(pressed(page)).toHaveAttribute("data-theme-choice", choice);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
    ).toBe(choice);
    await page.emulateMedia({ colorScheme: os });
    await page.reload();
    await expect(pressed(page)).toHaveAttribute("data-theme-choice", choice);
    await expect
      .poll(() => paint(page))
      .toEqual({ theme: choice, body: choice });
  }

  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();
  await expect(pressed(page)).toHaveAttribute("data-theme-choice", "dark");
  await expect.poll(() => paint(page)).toEqual({ theme: "none", body: "dark" });
});

for (const scheme of SCHEMES) {
  test.describe(`every page in ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    for (const path of THEME_PAGES) {
      test(`${path} paints ${scheme} and reads at AA`, async ({ page }) => {
        await settle(page, path);
        expect(await paint(page)).toEqual({ theme: "none", body: scheme });
        await expectAA(page);
      });
    }

    test("the status popover and the date picker read at AA", async ({
      page,
    }) => {
      await settle(page, "/orders");
      await bar(page).locator('[data-filter="status_code"]').click();
      await expect(page.locator("[data-option]").first()).toBeVisible();
      await expectAA(page);
      await page.keyboard.press("Escape");
      await bar(page).locator('[data-filter="created_at.calendar"]').click();
      await expect(
        page.locator("[role=dialog], [role=grid]").first(),
      ).toBeVisible();
      await expectAA(page);
    });
  });
}
