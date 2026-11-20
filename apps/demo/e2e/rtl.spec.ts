import type { Page } from "@playwright/test";

import {
  countValue,
  dragBy,
  dragTo,
  expect,
  expectWidth,
  headers,
  openGrid,
  pick,
  scroller,
  test,
} from "./fixtures";

async function fromRight(
  page: Page,
  selector: string,
): Promise<[number, number]> {
  return page.evaluate((s) => {
    const g = document
      .querySelector("[data-part=grid-scroller]")!
      .getBoundingClientRect();
    const b = document.querySelector(s)!.getBoundingClientRect();
    return [Math.round(g.right - b.right), Math.round(g.right - b.left)] as [
      number,
      number,
    ];
  }, selector);
}

async function expectPinnedLayout(page: Page) {
  expect(await fromRight(page, ".qg-header-cell.qg-select-cell")).toEqual([
    1, 41,
  ]);
  expect(await fromRight(page, "[data-header=order_number]")).toEqual([
    41, 151,
  ]);
}

test("right to left mirrors the grid", async ({ page }) => {
  await openGrid(page, "/rtl");
  expect(await page.locator(".workspace").getAttribute("dir")).toBe("rtl");
  expect(
    await page
      .locator("[data-part=grid]")
      .evaluate((element) => getComputedStyle(element).direction),
  ).toBe("rtl");
  await expectPinnedLayout(page);
  const handle = await fromRight(page, "[data-resize=customer_name]");
  const header = await fromRight(page, "[data-header=customer_name]");
  expect(Math.abs(handle[1] - header[1])).toBeLessThanOrEqual(8);

  await expectWidth(page, "customer_name", 200);
  await dragBy(page, page.locator('[data-resize="customer_name"]'), -100);
  await expectWidth(page, "customer_name", 300);
  await page.locator('[data-resize="customer_name"]').focus();
  await page.keyboard.press("ArrowLeft");
  await expectWidth(page, "customer_name", 310);
  await page.keyboard.press("Shift+ArrowRight");
  await expectWidth(page, "customer_name", 260);
  await page.keyboard.press("Escape");
  await expectWidth(page, "customer_name", 300);

  expect(await headers(page, 6)).toBe(
    "order_number,created_at,status_code,customer_name,total,region",
  );
  await page.locator('[data-header="status_code"]').focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Space");
  await expect
    .poll(() => headers(page, 6))
    .toBe("order_number,created_at,customer_name,status_code,total,region");
  await dragTo(
    page,
    page.locator('[data-header="region"] .qg-header-label'),
    page.locator('[data-header="created_at"] .qg-header-label'),
  );
  await expect
    .poll(() => headers(page, 6))
    .toBe("order_number,region,created_at,customer_name,status_code,total");

  await scroller(page).evaluate((element) => element.scrollTo(-520, 400));
  await expect
    .poll(() => scroller(page).evaluate((element) => element.scrollLeft))
    .toBe(-520);
  await expectPinnedLayout(page);

  await page.locator("[data-part=columns-menu-trigger]").click();
  await page.locator('[data-column-pin="customer_name"]').click();
  await page.keyboard.press("Escape");
  await expect
    .poll(async () => (await fromRight(page, "[data-header=customer_name]"))[0])
    .toBe(151);
});

test("right to left places the sidebar and the chips", async ({ page }) => {
  await openGrid(page, "/rtl");
  await page.locator("[data-part=filter-sidebar-trigger]").click();
  const sidebar = page.locator("[data-part=filter-sidebar]");
  await expect(sidebar).toBeVisible();
  await expect
    .poll(() =>
      sidebar.evaluate((element) =>
        Math.round(element.getBoundingClientRect().left),
      ),
    )
    .toBe(0);
  await page.locator("[data-sidebar-close]").click();
  await expect(sidebar).toBeHidden();

  await pick(page, "status_code", "paid", "shipped");
  await expect(
    page.locator('[data-chip="filter:status_code:any_of"] .qg-chip-value'),
  ).toHaveCount(2);
  const placement = await page.evaluate(() => {
    const chip = document.querySelector("[data-chip]")!.getBoundingClientRect();
    const reset = document
      .querySelector("[data-chips-reset]")!
      .getBoundingClientRect();
    const value = document.querySelector(".qg-chip-value")!;
    const text = value.querySelector("bdi")!.getBoundingClientRect();
    const remove = value.querySelector("button")!.getBoundingClientRect();
    return {
      chipRightOfReset: chip.left > reset.left,
      removeLeftOfValue: remove.left < text.left,
    };
  });
  expect(placement).toEqual({
    chipRightOfReset: true,
    removeLeftOfValue: true,
  });
  await expect(countValue(page)).toHaveAttribute("data-count", /\d+/);
});
