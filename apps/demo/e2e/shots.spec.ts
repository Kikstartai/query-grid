import path from "node:path";

import type { Page } from "@playwright/test";

import {
  dragBy,
  expect,
  open,
  openGrid,
  pressTimes,
  scroller,
  test,
} from "./fixtures";

const OUT = path.resolve(__dirname, "../../../docs/screenshots");

async function shot(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

test.use({ colorScheme: "light" });

test("README screenshots", async ({ page }) => {
  test.setTimeout(180_000);
  await open(page, "/");
  await shot(page, "01-landing");
  await openGrid(page, "/orders");
  await shot(page, "02-default-grid");

  await openGrid(page, "/orders?f.region=gauteng");
  await page.locator("[data-part=filter-sidebar-trigger]").click();
  await expect(page.locator("[data-part=filter-sidebar]")).toBeVisible();
  await shot(page, "03-filter-sidebar");

  await openGrid(page, "/orders?f.status_code=shipped&f.region=gauteng");
  await shot(page, "04-chips-reset");

  await openGrid(page, "/orders?f.status_code=paid&sort=total.desc");
  await page.locator("[data-part=filter-sidebar-trigger]").click();
  await expect(page.locator("[data-part=filter-sidebar]")).toBeVisible();
  await shot(page, "05-disabled-with-reasons");

  await openGrid(
    page,
    "/orders?f.status_code=paid&r.total=20000..60000&sort=total.desc",
  );
  await shot(page, "06-capped-count-no-total");
  await page.locator("[data-count-exact]").click();
  await expect(page.locator("[data-count]")).toHaveAttribute(
    "data-count-source",
    "exact",
  );
  await shot(page, "07-exact-count");

  await openGrid(
    page,
    "/orders?f.status_code=paid&r.created_at=2026-11-01T00:00:00.000000Z..2026-11-07T23:59:59.999999Z",
  );
  await shot(page, "08-total-live");
  await openGrid(page, "/orders?f.status_code=paid");
  await shot(page, "09-total-from-counter");

  await openGrid(page, "/orders?q=zanele+dlamini");
  await page.locator('[data-header-sort="total"]').click();
  await expect(page).toHaveURL(/sort=total/);
  await shot(page, "10-search-answered");
  await open(page, "/orders?q=---");
  await expect(page.locator("[data-feed-state=error]")).toBeVisible();
  await shot(page, "11-search-refused");

  await openGrid(page, "/orders");
  await page.locator('[data-header-filter="status_code"] button').click();
  await page
    .locator("[data-slot=popover-content] [data-filter=status_code]")
    .click();
  await shot(page, "12-header-filter");

  await openGrid(page, "/orders");
  await page.locator("[data-part=columns-menu-trigger]").click();
  await expect(page.locator("[data-part=columns-menu]")).toBeVisible();
  await shot(page, "13-columns-menu");

  await openGrid(page, "/orders");
  await page.locator('[data-row="2"] [data-col="1"]').click();
  await pressTimes(page, "Shift+ArrowDown", 4);
  await pressTimes(page, "Shift+ArrowRight", 3);
  await shot(page, "14-range-selection");

  await openGrid(page, "/orders");
  await dragBy(page, page.locator('[data-resize="customer_name"]'), 100);
  await scroller(page).evaluate((element) => element.scrollTo(520, 600));
  await shot(page, "15-resize-pinned-scrolled");

  await open(page, "/orders?view=list");
  await expect(page.locator("[data-card]").first()).toBeVisible();
  await shot(page, "16-list-view");
  await open(page, "/orders?view=board");
  await expect(
    page.locator("[data-column=paid] [data-card]").first(),
  ).toBeVisible();
  await shot(page, "17-board");

  const card = page.locator("[data-column=paid] [data-card]").first();
  const target = page.locator(
    '[data-column="shipped"] [data-card]:nth-of-type(3)',
  );
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  if (from && to) {
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
      steps: 12,
    });
    await shot(page, "18-board-drag");
    await page.keyboard.press("Escape");
    await page.mouse.up();
  }

  await open(page, "/parts/facets?f.status_code=refunded");
  await shot(page, "19-part-facets-alone");
  await openGrid(
    page,
    "/memory?f.team=growth&f.team=platform&f.priority=high&sort=budget.desc",
  );
  await shot(page, "20-in-memory");
  await openGrid(page, "/restyled");
  await shot(page, "21-token-restyle");

  await openGrid(
    page,
    "/orders?f.status_code=paid&f.status_code=shipped&f.region=gauteng",
  );
  await page
    .locator("[data-part=filter-bar] [data-filter=status_code]")
    .click();
  await shot(page, "22-several-values");
  await page.keyboard.press("Escape");

  await openGrid(page, "/rtl?f.status_code=paid&f.status_code=shipped");
  await page.locator("[data-part=filter-sidebar-trigger]").click();
  await expect(page.locator("[data-part=filter-sidebar]")).toBeVisible();
  await shot(page, "23-right-to-left");

  await openGrid(page, "/components");
  await page.locator('[data-facet="fruit"]').click();
  await page.locator('[data-facet="grain"]').click();
  await shot(page, "24-base-components");
});
