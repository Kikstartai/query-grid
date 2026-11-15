import type { Page } from "@playwright/test";

import {
  attrs,
  dragBy,
  dragTo,
  expect,
  expectWidth,
  headers,
  loaded,
  openGrid,
  pressTimes,
  rowGaps,
  scroller,
  test,
  width,
} from "./fixtures";

const CUSTOMER = '[data-resize="customer_name"]';

async function active(page: Page): Promise<[number, number]> {
  const value =
    (await page.locator("[data-status=active]").getAttribute("data-value")) ??
    "";
  const [row, col] = value.split(":").map(Number);
  return [row, col];
}

async function offsets(
  page: Page,
  selector: string,
): Promise<[number, number]> {
  return page.evaluate((s) => {
    const g = document
      .querySelector("[data-part=grid-scroller]")!
      .getBoundingClientRect();
    const b = document.querySelector(s)!.getBoundingClientRect();
    return [Math.round(b.left - g.left), Math.round(b.top - g.top)] as [
      number,
      number,
    ];
  }, selector);
}

test("resize by mouse", async ({ page }) => {
  await openGrid(page, "/orders");
  await expectWidth(page, "customer_name", 200);
  await dragBy(page, page.locator(CUSTOMER), 100);
  await expectWidth(page, "customer_name", 300);
  expect(await width(page, ".qg-cell[data-field=customer_name]")).toBe(300);
  await dragBy(page, page.locator(CUSTOMER), -180, { hold: true });
  await expectWidth(page, "customer_name", 120);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expectWidth(page, "customer_name", 300);
  await dragBy(page, page.locator(CUSTOMER), 900);
  await expectWidth(page, "customer_name", 600);
});

test("resize by keyboard, and it persists", async ({ page }) => {
  await openGrid(page, "/orders");
  await dragBy(page, page.locator(CUSTOMER), 100);
  await expectWidth(page, "customer_name", 300);
  const handle = page.locator(CUSTOMER);
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await expectWidth(page, "customer_name", 310);
  await page.keyboard.press("Shift+ArrowLeft");
  await expectWidth(page, "customer_name", 260);
  await pressTimes(page, "ArrowLeft", 2);
  await expectWidth(page, "customer_name", 240);
  await page.keyboard.press("Escape");
  await expectWidth(page, "customer_name", 300);
  await pressTimes(page, "Shift+ArrowRight", 7);
  await expectWidth(page, "customer_name", 600);
  await pressTimes(page, "Shift+ArrowLeft", 12);
  await expectWidth(page, "customer_name", 60);
  await handle.focus();
  await pressTimes(page, "Shift+ArrowRight", 4);
  await expectWidth(page, "customer_name", 260);
  await expect
    .poll(() =>
      page.evaluate(
        () => localStorage.getItem("query-grid:orders:columns") ?? "",
      ),
    )
    .toContain("260");
  await page.reload();
  await expect(loaded(page)).toBeVisible();
  await expectWidth(page, "customer_name", 260);
  expect(await width(page, ".qg-cell[data-field=customer_name]")).toBe(260);
});

test("resize while scrolled sideways keeps the pinned columns in place", async ({
  page,
}) => {
  await openGrid(page, "/orders");
  await scroller(page).evaluate((element) => element.scrollTo(520, 600));
  await expect
    .poll(() => scroller(page).evaluate((element) => element.scrollLeft))
    .toBe(520);
  await expectWidth(page, "region", 150);
  await dragBy(page, page.locator('[data-resize="region"]'), 80);
  await expectWidth(page, "region", 230);
  expect(await offsets(page, ".qg-row .qg-select-cell")).toEqual([
    1,
    expect.any(Number),
  ]);
  expect((await offsets(page, ".qg-row [data-field=order_number]"))[0]).toBe(
    41,
  );
  expect(await offsets(page, "[data-header=order_number]")).toEqual([41, 1]);
  expect(await offsets(page, "[data-part=grid-header]")).toEqual([
    expect.any(Number),
    1,
  ]);
});

test("virtualised scroll and keyset paging", async ({ page }) => {
  await openGrid(page, "/orders");
  for (let page_ = 2; page_ <= 13; page_++) {
    await scroller(page).evaluate((element) =>
      element.scrollTo(0, element.scrollHeight),
    );
    await expect(loaded(page)).toHaveAttribute(
      "data-value",
      String(page_ * 500),
    );
  }
  await expect(loaded(page)).toHaveText(
    /^6\s500 rows loaded in 13 keyset pages$/,
  );
  const mounted = Number(
    await page.locator("[data-part=grid-rows]").getAttribute("data-mounted"),
  );
  expect(mounted).toBeGreaterThan(10);
  expect(mounted).toBeLessThan(60);
  const rows = await rowGaps(page);
  expect(rows.gaps).toBe(0);
  expect(Math.min(...rows.heights)).toBeGreaterThanOrEqual(37);
});

test("rows after an in-memory re-sort have no gap or overlap", async ({
  page,
}) => {
  await openGrid(page, "/orders?q=zanele+dlamini");
  await expect(loaded(page)).toHaveAttribute("data-value", "34");
  for (const field of ["total", "total", "created_at", "created_at"]) {
    const before = page.url();
    await page.locator(`[data-header-sort="${field}"]`).click();
    await expect(page).not.toHaveURL(before);
    await expect.poll(async () => (await rowGaps(page)).gaps).toBe(0);
  }
});

test("arrow keys, range and TSV", async ({ page }) => {
  await openGrid(page, "/orders");
  await page.locator('[data-row="2"] [data-col="1"]').click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[data-status=active]")).toHaveAttribute(
    "data-value",
    "3:2",
  );
  await pressTimes(page, "Shift+ArrowDown", 3);
  await pressTimes(page, "Shift+ArrowRight", 3);
  await expect(page.locator("[data-status=range]")).toHaveAttribute(
    "data-value",
    /.+/,
  );
  await page.keyboard.press("Control+c");
  await expect
    .poll(async () => {
      const text =
        (await page.locator("[data-status=copied]").textContent()) ?? "";
      const lines = text.split("\n").filter(Boolean);
      return [lines.length, lines[0]?.split("\t").length ?? 0];
    })
    .toEqual([4, 4]);
  await page.keyboard.press("Home");
  const [homeRow, homeCol] = await active(page);
  expect(homeCol).toBeLessThan(2);
  await page.keyboard.press("End");
  const [endRow, endCol] = await active(page);
  expect(endRow).toBe(homeRow);
  expect(endCol).toBeGreaterThan(10);
  await page.keyboard.press("Control+Home");
  await expect(page.locator("[data-status=active]")).toHaveAttribute(
    "data-value",
    `0:${homeCol}`,
  );
  await page.keyboard.press("Control+End");
  await expect(page.locator("[data-status=active]")).toHaveAttribute(
    "data-value",
    `499:${endCol}`,
  );
  await expect(loaded(page)).toHaveAttribute("data-value", "1000");
});

test("selection", async ({ page }) => {
  await openGrid(page, "/orders");
  const selected = page.locator("[data-status=selected]");
  await page.locator('[data-row="0"] [data-select-row]').click();
  await expect(selected).toHaveAttribute("data-value", "1");
  await page
    .locator('[data-row="5"] [data-select-row]')
    .click({ modifiers: ["Shift"] });
  await expect(selected).toHaveAttribute("data-value", "6");
  await page.locator("[data-select-all]").click();
  await expect(selected).toHaveAttribute("data-value", "500");
  await page.locator("[data-select-all]").click();
  await expect(selected).toHaveAttribute("data-value", "0");
  await page.locator('[data-row="3"] [data-select-row]').focus();
  await page.keyboard.press("Space");
  await expect(selected).toHaveAttribute("data-value", "1");
});

test("column reorder by keyboard and pointer", async ({ page }) => {
  await openGrid(page, "/orders");
  expect(await headers(page)).toBe(
    "order_number,created_at,status_code,customer_name,total,region,channel,item_count",
  );
  await page.locator('[data-header="status_code"]').focus();
  await page.keyboard.press("Space");
  await pressTimes(page, "ArrowRight", 2);
  await page.keyboard.press("Space");
  await expect
    .poll(() => headers(page))
    .toBe(
      "order_number,created_at,customer_name,total,status_code,region,channel,item_count",
    );
  const cells = await attrs(
    page.locator('[data-row="0"] [data-field]'),
    "data-field",
  );
  expect(cells.slice(0, 8).join(",")).toBe(await headers(page));
  await page.locator('[data-header="status_code"]').focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Escape");
  await expect
    .poll(() => headers(page))
    .toBe(
      "order_number,created_at,customer_name,total,status_code,region,channel,item_count",
    );
  await dragTo(
    page,
    page.locator('[data-header="region"] .qg-header-label'),
    page.locator('[data-header="created_at"] .qg-header-label'),
  );
  await expect
    .poll(() => headers(page))
    .toBe(
      "order_number,region,created_at,customer_name,total,status_code,channel,item_count",
    );
});

test("pin and visibility survive a reload, and Reset restores the def", async ({
  page,
}) => {
  await openGrid(page, "/orders");
  const start = await headers(page, 20);
  await page.locator("[data-part=columns-menu-trigger]").click();
  await expect(page.locator("[data-part=columns-menu]")).toBeVisible();
  await page.locator('[data-column-toggle="currency"]').click();
  await expect(page.locator("[data-header=currency]")).toHaveCount(0);
  await page.locator('[data-column-toggle="id"]').click();
  await expect(page.locator("[data-header=id]")).toHaveCount(1);
  await page.locator('[data-column-pin="customer_name"]').click();
  await expect(
    page.locator('[data-column-pin="customer_name"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  const expectPinned = async () => {
    await expect
      .poll(() => headers(page, 3))
      .toBe("order_number,customer_name,created_at");
    await expect(page.locator("[data-header=currency]")).toHaveCount(0);
    await expect(page.locator("[data-header=id]")).toHaveCount(1);
    await expect(page.locator("[data-header=customer_name]")).toHaveAttribute(
      "data-pinned",
      "",
    );
    expect((await offsets(page, "[data-header=customer_name]"))[0]).toBe(151);
  };
  await expectPinned();
  await scroller(page).evaluate((element) => element.scrollTo(600, 0));
  await expect
    .poll(() => scroller(page).evaluate((element) => element.scrollLeft))
    .toBe(600);
  await expectPinned();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("query-grid:orders:columns")),
    )
    .toMatch(/"key":"customer_name"[^}]*"pinned":true/);
  await page.reload();
  await expect(loaded(page)).toBeVisible();
  await expectPinned();
  await page.locator("[data-part=columns-menu-trigger]").click();
  await page.locator("[data-columns-reset]").click();
  await page.keyboard.press("Escape");
  await expect.poll(() => headers(page, 20)).toBe(start);
});
