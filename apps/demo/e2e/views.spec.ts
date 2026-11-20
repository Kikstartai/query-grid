import type { Page } from "@playwright/test";

import {
  attrs,
  bar,
  countValue,
  dragBy,
  expect,
  expectWidth,
  loaded,
  open,
  openGrid,
  pick,
  search,
  test,
  texts,
  total,
  urlPath,
} from "./fixtures";

const PART_ROOTS: Record<string, string> = {
  "filter-bar": "filter-bar",
  chips: "filter-chips",
  sidebar: "filter-sidebar-trigger",
  facets: "facet-panel",
  count: "count",
  total: "total",
  grid: "grid",
  list: "list",
  board: "board",
};

function countApiRequests(page: Page): () => number {
  let requests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) {
      requests++;
    }
  });
  return () => requests;
}

test("the in-memory route filters, sorts and totals with no request", async ({
  page,
}) => {
  const requests = countApiRequests(page);
  await openGrid(page, "/memory");
  await expect(countValue(page)).toHaveAttribute("data-count", "400");
  await expect(bar(page).locator("[data-unavailable]")).toHaveCount(0);
  await pick(page, "team", "growth");
  await pick(page, "priority", "high");
  await expect(countValue(page)).toHaveAttribute("data-count", "41");
  const facets = await texts(page.locator("[data-facet]"));
  expect(facets.some((facet) => /\d/.test(facet))).toBe(true);
  await search(page, "fix");
  await page.locator('[data-header-sort="budget"]').click();
  await expect(page).toHaveURL(/sort=budget/);
  await expect(countValue(page)).toHaveAttribute("data-count", "5");
  await expect(total(page).locator("[data-total-sum]").first()).toHaveText(
    "$4,640.00",
  );
  await expect(bar(page).locator("[data-unavailable]")).toHaveCount(0);
  await pick(page, "team", "platform");
  await expect(countValue(page)).toHaveAttribute("data-count", "11");
  await expect(
    page.locator('[data-chip="filter:team:any_of"] .qg-chip-value'),
  ).toHaveCount(2);
  await page.locator("[data-view=board]").click();
  await expect(page.locator("[data-column]").first()).toBeVisible();
  const lanes = await attrs(page.locator("[data-column]"), "data-loaded");
  expect(lanes.reduce((sum, n) => sum + Number(n), 0)).toBe(11);
  expect(requests()).toBe(0);
});

test.describe("parts mount alone", () => {
  for (const [part, root] of Object.entries(PART_ROOTS)) {
    test(part, async ({ page }) => {
      await open(page, `/parts/${part}?f.status_code.any_of=refunded`);
      const solo = page.locator(`[data-solo-part="${part}"]`);
      await expect(solo.locator(`[data-part="${root}"]`).first()).toBeVisible();
      await expect(solo.locator("[data-part=query-readout]")).toContainText(
        '"refunded"',
      );
      const others = Object.values(PART_ROOTS).filter(
        (other) => other !== root,
      );
      const present = new Set(
        await attrs(solo.locator("[data-part]"), "data-part"),
      );
      expect(others.filter((other) => present.has(other))).toEqual([]);
    });
  }

  test("a facet click on the facets part reaches the query and the URL", async ({
    page,
  }) => {
    await open(page, "/parts/facets?f.status_code.any_of=refunded");
    await page.locator('[data-facet="paid"]').click();
    await expect(page).toHaveURL(
      /f\.status_code\.any_of=refunded&f\.status_code\.any_of=paid|f\.status_code\.any_of=paid/,
    );
    await expect(page.locator("[data-part=query-readout]")).toContainText(
      '"paid"',
    );
  });
});

test("grid, list and board keep the query", async ({ page }) => {
  await openGrid(page, "/orders");
  await pick(page, "region", "gauteng");
  await page.locator("[data-view=list]").click();
  await expect(page).toHaveURL(
    /f\.region\.any_of=gauteng.*view=list|view=list.*f\.region\.any_of=gauteng/,
  );
  await expect(
    page.locator('[data-chip="filter:region:any_of"]'),
  ).toBeVisible();
  await expect(page.locator("[data-card]").first()).toBeVisible();
  await page.locator("[data-view=board]").click();
  await expect(page).toHaveURL(/view=board/);
  await expect(page.locator("[data-column]")).toHaveCount(7);
  await expect(page.locator("[data-column] [data-card]").first()).toBeVisible();
  for (const text of await texts(page.locator("[data-column-count]"))) {
    expect(text).toBe("");
  }
  await expect(
    page.locator('[data-chip="filter:region:any_of"]'),
  ).toBeVisible();
  await page.locator("[data-view=grid]").click();
  await expect(page).not.toHaveURL(/view=/);
  await expect(page).toHaveURL(/f\.region\.any_of=gauteng/);
  await expect(
    page.locator('[data-chip="filter:region:any_of"]'),
  ).toBeVisible();
});

test("URL round-trip", async ({ page }) => {
  await open(
    page,
    "/orders?f.status_code.any_of=shipped&f.region.any_of=gauteng&sort=created_at.asc&view=list",
  );
  await expect(page.locator("[data-part=list]")).toBeVisible();
  await expect(page.locator("[data-chip]")).toHaveCount(3);
  await expect(
    page.locator("[data-chip]").filter({ hasText: "Created" }),
  ).toContainText("↑");
  expect(await urlPath(page)).toBe(
    "/orders?f.status_code.any_of=shipped&f.region.any_of=gauteng&sort=created_at.asc&view=list",
  );
  await openGrid(page, "/orders?f.channel.any_of=web&sort=total.desc");
  await expect.poll(() => urlPath(page)).toBe("/orders");
  await expect(page.locator("[data-chip]")).toHaveCount(1);
  await expect(countValue(page)).toHaveAttribute("data-count", "620000");
});

test("virtualised board columns page by 50", async ({ page }) => {
  await open(page, "/orders?view=board");
  const completed = page.locator("[data-column=completed]");
  await expect(completed).toHaveAttribute("data-loaded", "50");
  for (let n = 100; n <= 350; n += 50) {
    await completed.evaluate((element) =>
      element.scrollTo(0, element.scrollHeight),
    );
    await expect(completed).toHaveAttribute("data-loaded", String(n));
  }
  const mounted = Number(
    await completed.locator("[data-mounted]").getAttribute("data-mounted"),
  );
  expect(mounted).toBeGreaterThan(5);
  expect(mounted).toBeLessThan(30);
});

test("base components stand alone", async ({ page }) => {
  const requests = countApiRequests(page);
  await openGrid(page, "/components");
  await expect(countValue(page)).toHaveAttribute("data-count", "60");
  await expect(page.locator("[data-row]").first()).toBeVisible();
  await page.locator('[data-facet="fruit"]').click();
  await page.locator('[data-facet="grain"]').click();
  await expect(countValue(page)).toHaveAttribute("data-count", "40");
  const kinds = new Set(await texts(page.locator(".qg-cell[data-field=kind]")));
  expect([...kinds].sort()).toEqual(["Fruit", "Grain"]);
  await page.locator('[data-header-sort="price"]').click();
  await expect
    .poll(async () => {
      const prices = await page
        .locator(".qg-cell[data-field=price]")
        .evaluateAll((cells) =>
          cells
            .slice(0, 5)
            .map((cell) => Number(cell.textContent?.replace(/[^\d.]/g, ""))),
        );
      const sorted = [...prices].sort((a, b) => a - b);
      return (
        prices.join() === sorted.join() ||
        prices.join() === sorted.reverse().join()
      );
    })
    .toBe(true);
  await page
    .locator('[data-chip-remove="kind"][data-chip-value="fruit"]')
    .click();
  await expect(countValue(page)).toHaveAttribute("data-count", "20");
  const start = await page
    .locator('[data-header="name"]')
    .evaluate((element) => Math.round(element.getBoundingClientRect().width));
  await dragBy(page, page.locator('[data-resize="name"]'), 60);
  await expectWidth(page, "name", start + 60);
  await expect(loaded(page)).toBeVisible();
  expect(requests()).toBe(0);
  await expect(page.locator("[data-part=query-readout]")).toHaveCount(0);
});
