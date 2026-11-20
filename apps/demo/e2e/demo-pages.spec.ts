import type { Page } from "@playwright/test";

import { countValue, expect, loaded, openGrid, test } from "./fixtures";

const guide = (page: Page) => page.locator("[data-feature-guide]");
const tab = (page: Page, name: string) =>
  guide(page).getByRole("tab", { name, exact: true });
const header = (page: Page, field: string) =>
  page.locator(`[data-header="${field}"]`);
const workspace = (page: Page) => page.locator(".workspace");
const html = (page: Page) => page.locator("html");

test.describe("grid features page", () => {
  test("the guide sorts by two columns and says when reorder is on", async ({
    page,
  }) => {
    await openGrid(page, "/features");
    await tab(page, "Reorder").click();
    await expect(page.locator("[data-feature-reorder]")).toHaveAttribute(
      "data-feature-reorder",
      "on",
    );
    await tab(page, "Sort columns").click();
    await page.locator('[data-feature-action="sort"]').click();
    await expect(page).toHaveURL(/sort=team\.asc(,|%2C)budget\.desc/);
    await tab(page, "Reorder").click();
    await expect(page.locator("[data-feature-reorder]")).toHaveText(
      "Reorder is off: Sort by Rank ascending, and by nothing else, to reorder.",
    );
    await page.locator('[data-feature-action="reorder"]').click();
    await expect(page.locator("[data-feature-reorder]")).toHaveAttribute(
      "data-feature-reorder",
      "on",
    );
  });

  test("the selection readout follows the grid and the assignee is a link", async ({
    page,
  }) => {
    await openGrid(page, "/features");
    await tab(page, "Selection").click();
    const readout = page.locator("[data-feature-selection]");
    await expect(readout).toHaveText("Selected now: nothing");
    await page.locator(".qg-row .qg-select-cell").first().click();
    await expect(readout).toHaveText(
      "Selected now: 1 by id, as the host receives them",
    );
    const link = page
      .locator('.qg-row .qg-cell[data-field="assignee"] a')
      .first();
    await expect(link).toHaveAttribute(
      "href",
      /^\/memory\?f\.assignee\.any_of=/,
    );
  });

  test("a stored def is accepted clean or refused with its problems", async ({
    page,
  }) => {
    await openGrid(page, "/features");
    await tab(page, "Stored defs").click();
    const result = page.locator("[data-stored-result]");
    await expect(result).toHaveAttribute("data-stored-result", "ok");
    await page.locator('[data-stored-sample="tampered"]').click();
    await expect(result).toHaveAttribute("data-stored-result", "refused");
    await expect(result).toContainText("stored_unknown_key");
    await expect(result).toContainText("stored_duplicate");
  });
});

test.describe("localized page", () => {
  test("Afrikaans translates the messages, the labels and the numbers", async ({
    page,
  }) => {
    await openGrid(page, "/localized/af");
    await expect(workspace(page)).toHaveAttribute("lang", "af-ZA");
    await expect(html(page)).toHaveAttribute("lang", "af-ZA");
    await expect(countValue(page)).toContainText("400 rye");
    await expect(header(page, "priority")).toContainText("Prioriteit");
    await expect(page.locator("[data-export]")).toHaveText("Voer CSV uit");
    await expect(loaded(page)).toContainText("400 rye gelaai");
    await expect(page.locator(".qg-row").first()).toContainText("Nee");
  });

  test("Arabic runs right to left with its own digits and plural", async ({
    page,
  }) => {
    await openGrid(page, "/localized/ar");
    await expect(workspace(page)).toHaveAttribute("dir", "rtl");
    await expect(html(page)).toHaveAttribute("dir", "rtl");
    await expect(countValue(page)).toContainText("٤٠٠ صف");
    await expect(header(page, "priority")).toContainText("الأولوية");
    await expect(page.locator("[data-export]")).toHaveText("تصدير CSV");
  });

  test("the language links switch the page and restore the document", async ({
    page,
  }) => {
    await openGrid(page, "/localized/ar");
    await page.locator(".language-nav a", { hasText: "English" }).click();
    await expect(page).toHaveURL(/\/localized\/en$/);
    // The page left stays mounted, hidden, so only what shows is read.
    await expect(page.locator("[data-count]:visible")).toHaveText("400 rows");
    await expect(html(page)).toHaveAttribute("dir", "ltr");
    await expect(
      page.locator('[data-header="priority"]:visible'),
    ).toContainText("Priority");
  });

  test("the bare route opens Afrikaans and an unknown language is not found", async ({
    page,
  }) => {
    await page.goto("/localized");
    await expect(page).toHaveURL(/\/localized\/af$/);
    const missing = await page.request.get("/localized/xx");
    expect(missing.status()).toBe(404);
  });
});

test.describe("back link", () => {
  for (const path of [
    "/orders",
    "/memory",
    "/features",
    "/components",
    "/restyled",
    "/rtl",
    "/localized/af",
    "/parts/filter-bar",
  ]) {
    test(`${path} links back to the start`, async ({ page }) => {
      await page.goto(path);
      const back = page.locator("[data-back-link]:visible");
      await expect(back).toHaveAttribute("href", "/");
      await back.click();
      await expect(page).toHaveURL(/\/$/);
    });
  }

  test("the start page has no back link", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-back-link]")).toHaveCount(0);
  });
});
