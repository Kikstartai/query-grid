import { expect, expectCount, apiCount, open, test } from "./fixtures";

import type { Page } from "@playwright/test";

const list = (page: Page) => page.locator("[data-part=list]");
const sidebar = (page: Page) => page.locator("[data-part=filter-sidebar]");

async function openList(page: Page, path: string) {
  await open(page, path);
  await expect(page.locator("[data-card]").first()).toBeVisible();
}

async function box(page: Page, selector: string) {
  const found = await page.locator(selector).first().boundingBox();
  if (!found) {
    throw new Error(`${selector} has no box`);
  }
  return found;
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("a phone opens the orders in the card list", async ({ page }) => {
  await openList(page, "/orders");
  await expect(page).toHaveURL(/view=list/);
  await expect(list(page)).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test("the grid features page stays in the grid on a phone", async ({
  page,
}) => {
  await open(page, "/features");
  await expect(page.locator("[data-part=grid]")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page).not.toHaveURL(/view=/);
});

test("a view named in the URL is kept", async ({ page }) => {
  await open(page, "/orders?view=board");
  await expect(page.locator("[data-part=board]")).toBeVisible();
  await expect(page).toHaveURL(/view=board/);
});

test("the results take at least half the screen", async ({ page }) => {
  await openList(page, "/orders");
  const viewport = page.viewportSize();
  const results = await box(page, "[data-part=list]");
  expect(results.height).toBeGreaterThanOrEqual((viewport?.height ?? 0) / 2);
});

test("the bar keeps only search and sort", async ({ page }) => {
  await openList(page, "/orders");
  const shown = await page
    .locator("[data-part=filter-bar] > [data-field]")
    .evaluateAll((fields) =>
      fields
        .filter((field) => field.getBoundingClientRect().width > 0)
        .map((field) => field.getAttribute("data-kind")),
    );
  expect(shown).toEqual(["search", "sort"]);
  const bar = await box(page, "[data-part=filter-bar]");
  expect(bar.height).toBeLessThan(48);
});

test("a bar with no drawer keeps every filter on one scrolling row", async ({
  page,
}) => {
  await open(page, "/restyled");
  const bar = page.locator("[data-part=filter-bar]");
  await expect(bar.locator('[data-field="status_code"]')).toBeVisible();
  expect((await box(page, "[data-part=filter-bar]")).height).toBeLessThan(48);
  expect(
    await bar.evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
  await expectNoSidewaysScroll(page);
});

test("the facets and the chips each stay on one row", async ({ page }) => {
  await openList(page, "/orders?f.region.any_of=gauteng&f.channel.any_of=web");
  const facets = await box(page, "[data-part=facet-panel]");
  const chips = await box(page, "[data-part=filter-chips]");
  expect(facets.height).toBeLessThan(48);
  expect(chips.height).toBeLessThan(48);
  await page.locator('[data-facet="paid"]').click();
  await expect(page).toHaveURL(/f\.status_code\.any_of=paid/);
  await expectNoSidewaysScroll(page);
});

test("the drawer fills the screen and applies a filter", async ({ page }) => {
  await openList(page, "/orders");
  await page.locator("[data-part=filter-sidebar-trigger]").click();
  await expect(sidebar(page)).toBeVisible();
  const viewport = page.viewportSize();
  await expect
    .poll(async () => (await box(page, "[data-part=filter-sidebar]")).width)
    .toBe(viewport?.width);
  await sidebar(page).locator('[data-filter="status_code"]').click();
  await page.locator('[data-option="shipped"]').click();
  await expect(page).toHaveURL(/f\.status_code\.any_of=shipped/);
  await page.keyboard.press("Escape");
  await sidebar(page).locator("[data-slot=drawer-close]").last().click();
  await expect(sidebar(page)).toBeHidden();
  await expect(
    page.locator('[data-chip="filter:status_code:any_of"]'),
  ).toBeVisible();
  await expectCount(page, await apiCount(page, "f.status_code.any_of=shipped"));
  await expectNoSidewaysScroll(page);
});

test("the board snaps one column at a time", async ({ page }) => {
  await open(page, "/orders?view=board");
  const columns = page.locator(".qg-board-columns");
  await expect(columns).toBeVisible();
  expect(
    await columns.evaluate(
      (element) => getComputedStyle(element).scrollSnapType,
    ),
  ).toContain("mandatory");
  const viewport = page.viewportSize();
  const column = await box(page, ".qg-board-column");
  expect(column.width).toBeLessThan(viewport?.width ?? 0);
  await expectNoSidewaysScroll(page);
});

for (const path of ["/", "/memory", "/rtl", "/restyled", "/components"]) {
  test(`${path} has no sideways scroll`, async ({ page }) => {
    await open(page, path);
    await expectNoSidewaysScroll(page);
  });
}
