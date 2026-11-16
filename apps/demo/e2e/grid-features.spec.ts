import { readFileSync } from "node:fs";

import type { Locator, Page } from "@playwright/test";

import {
  apiCount,
  center,
  expect,
  loaded,
  openGrid,
  test,
  texts,
} from "./fixtures";

const NARROW = "f.status_code=failed&f.channel=phone";
const note = (page: Page) => page.locator("[data-grid-note]");
const headerSort = (page: Page, field: string) =>
  page.locator(`[data-header-sort="${field}"]`);
const cells = (page: Page, field: string) =>
  page.locator(`.qg-row .qg-cell[data-field="${field}"]`);

async function column(page: Page, field: string, n: number): Promise<string[]> {
  return (await texts(cells(page, field))).slice(0, n);
}

async function download(page: Page): Promise<string[]> {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("[data-export]").click(),
  ]);
  const path = await file.path();
  return readFileSync(path, "utf8").trimEnd().split("\r\n");
}

async function holdShift(page: Page, target: Locator) {
  await target.click({ modifiers: ["Shift"] });
}

test.describe("several sort columns", () => {
  test("a column only a composite index sorts brings the rest of its order", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    await headerSort(page, "item_count").click();
    await expect(page).toHaveURL(/sort=item_count\.desc(,|%2C)total\.desc/);
    await expect(headerSort(page, "item_count")).toHaveAttribute(
      "data-sort-position",
      "1",
    );
    await expect(headerSort(page, "total")).toHaveAttribute(
      "data-sort-position",
      "2",
    );
    await expect(headerSort(page, "total")).toHaveAttribute(
      "data-sorted",
      "desc",
    );
    await expect(page.locator(".qg-chip", { hasText: "Sort" })).toContainText(
      "Sort: Items ↓, then Total ↓",
    );
    await expect(loaded(page)).toHaveAttribute("data-value", "500");
    const items = (await column(page, "item_count", 20)).map(Number);
    expect(items).toEqual([...items].sort((a, b) => b - a));
    await headerSort(page, "item_count").click();
    await expect(page).toHaveURL(/sort=item_count\.asc(,|%2C)total\.asc/);
  });

  test("a sort the data cannot answer is disabled with its reason", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    const region = headerSort(page, "region");
    await expect(region).toHaveAttribute("aria-disabled", "true");
    await expect(region).toHaveAttribute("title", /Narrow by .* first: 620/);
    await expect(headerSort(page, "note")).toHaveCount(0);
  });

  test("over a narrowed set a further column is added, turned and removed with Shift", async ({
    page,
  }) => {
    await openGrid(page, `/orders?${NARROW}`);
    const region = headerSort(page, "region");
    await expect(region).not.toHaveAttribute("aria-disabled", "true");
    await holdShift(page, region);
    await expect(page).toHaveURL(/sort=created_at\.desc(,|%2C)region\.desc/);
    await expect(region).toHaveAttribute("data-sort-position", "2");
    await expect(headerSort(page, "created_at")).toHaveAttribute(
      "data-sort-position",
      "1",
    );
    await expect(loaded(page)).toBeVisible();
    await holdShift(page, region);
    await expect(page).toHaveURL(/sort=created_at\.desc(,|%2C)region\.asc/);
    await expect(region).toHaveAttribute("data-sorted", "asc");
    await holdShift(page, region);
    await expect(page).not.toHaveURL(/region\.(asc|desc)/);
    await expect(region).not.toHaveAttribute("data-sort-position");
  });

  test("the server refuses a further column on the whole table and answers a declared order", async ({
    page,
  }) => {
    const refused = await page.request.get(
      "/api/orders?sort=created_at.desc,total.asc",
    );
    expect(refused.status()).toBe(400);
    expect(((await refused.json()) as { code: string }).code).toBe(
      "narrow_first",
    );
    const answered = await page.request.get(
      "/api/orders?sort=item_count.asc,total.asc&limit=50",
    );
    expect(answered.status()).toBe(200);
    const body = (await answered.json()) as {
      rows: { item_count: number; total: number }[];
      nextCursor: string;
    };
    const keys = body.rows.map((row) => row.item_count * 1e12 + row.total);
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
    const next = await page.request.get(
      `/api/orders?sort=item_count.asc,total.asc&limit=50&cursor=${body.nextCursor}`,
    );
    const after = (await next.json()) as { rows: { item_count: number }[] };
    expect(after.rows).toHaveLength(50);
    const many = await page.request.get(
      `/api/orders?${NARROW}&sort=created_at.desc,total.asc,region.asc,channel.asc`,
    );
    expect(many.status()).toBe(400);
  });

  test("a client grid sorts by any columns, each its own way", async ({
    page,
  }) => {
    await openGrid(page, "/memory?sort=team.asc,budget.desc");
    await expect(headerSort(page, "budget")).toHaveAttribute(
      "data-sort-position",
      "2",
    );
    const teams = await column(page, "team", 12);
    expect(new Set(teams)).toEqual(new Set(["Billing"]));
    const budgets = (await column(page, "budget", 12)).map((text) =>
      Number(text.replace(/[^0-9.]/g, "")),
    );
    expect(budgets).toEqual([...budgets].sort((a, b) => b - a));
    await page.locator('[data-sort-then="budget"]').click();
    await expect(page).toHaveURL(/sort=team\.asc(,|%2C)budget\.asc/);
    await expect(page.locator("[data-sort=then]")).toContainText("Budget");
  });
});

test.describe("export", () => {
  test("on the whole table it is held with the limit, and the server refuses it", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    await expect(page.locator("[data-export]")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(page.locator("[data-part=export]")).toHaveAttribute(
      "title",
      /at most 50.000 rows: 620.000 rows match/,
    );
    const refused = await page.request.get("/api/orders/export");
    expect(refused.status()).toBe(400);
    expect(await refused.json()).toMatchObject({
      code: "export_too_large",
      params: { limit: 50000 },
    });
    const stray = await page.request.get(
      `/api/orders/export?${NARROW}&columns=nope`,
    );
    expect(stray.status()).toBe(400);
  });

  test("a narrowed result downloads whole, in the visible columns", async ({
    page,
  }) => {
    await openGrid(page, `/orders?${NARROW}`);
    const count = await apiCount(page, `${NARROW}&exact=1`);
    const lines = await download(page);
    expect(lines).toHaveLength(count + 1);
    expect(lines[0].replace(/^﻿/, "")).toMatch(
      /^"Order","Created","Status","Customer","Total","Region","Channel","Items"/,
    );
    expect(lines[0]).not.toContain("Customer account");
    expect(lines[1]).toContain(',"Failed",');
    expect(lines[1]).toContain(',"Phone",');
    const direct = await page.request.get(
      `/api/orders/export?${NARROW}&columns=order_number`,
    );
    expect(direct.headers()["content-type"]).toBe("text/csv; charset=utf-8");
    expect(direct.headers()["content-disposition"]).toContain("orders.csv");
    expect((await direct.text()).trimEnd().split("\r\n")).toHaveLength(
      count + 1,
    );
  });

  test("a client grid exports from memory what its filters leave", async ({
    page,
  }) => {
    await openGrid(page, "/memory?f.team=growth&sort=rank.asc");
    const shown = Number(await loaded(page).getAttribute("data-value"));
    const lines = await download(page);
    expect(lines).toHaveLength(shown + 1);
    expect(lines[0].replace(/^﻿/, "")).toMatch(
      /^"Task","Title","Status","Team"/,
    );
    expect(lines[1]).toContain(',"Growth",');
  });
});

test.describe("selection for bulk actions", () => {
  test("everything matching is selected as the query, from the count the page already has", async ({
    page,
  }) => {
    await openGrid(page, "/orders?f.region=gauteng");
    const counted: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/orders")) {
        counted.push(request.url());
      }
    });
    const bar = page.locator("[data-part=grid-selection]");
    await expect(bar).toBeHidden();
    await page.locator("[data-select-row]").nth(1).click();
    await expect(bar.locator("[data-selection=rows]")).toHaveText("1 selected");
    await expect(page.locator("[data-select-matching]")).toHaveCount(0);
    await page.locator("[data-select-all]").click();
    await expect(bar.locator("[data-selection=rows]")).toHaveText(
      "500 selected",
    );
    await expect(page.locator("[data-bulk-action]")).toHaveAttribute(
      "data-selection-kind",
      "rows",
    );
    await page.locator("[data-select-matching]").click();
    await expect(bar.locator("[data-selection=matching]")).toContainText(
      /All 10.000\+ rows that match are selected/,
    );
    await expect(page.locator("[data-bulk-action]")).toHaveAttribute(
      "data-selection-kind",
      "matching",
    );
    await page.locator("[data-bulk-action]").click();
    await expect(note(page)).toHaveText(
      'Bulk action on every row matching "f.region=gauteng"',
    );
    await expect(bar).toBeHidden();
    await expect(page.locator("[data-status=selected]")).toHaveAttribute(
      "data-value",
      "0",
    );
    expect(counted).toEqual([]);
  });

  test("deselecting one row leaves everything-matching for the rows by id", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    await page.locator("[data-select-all]").click();
    await page.locator("[data-select-matching]").click();
    await expect(page.locator("[data-selection=matching]")).toBeVisible();
    await page.locator("[data-select-row]").nth(2).click();
    await expect(page.locator("[data-selection=rows]")).toHaveText(
      "499 selected",
    );
    await expect(page.locator("[data-bulk-action]")).toHaveAttribute(
      "data-selection-kind",
      "rows",
    );
    await page.locator("[data-selection-clear]").click();
    await expect(page.locator("[data-part=grid-selection]")).toBeHidden();
  });

  test("a selection does not outlive the rows it was made on", async ({
    page,
  }) => {
    await openGrid(page, "/memory");
    await page.locator("[data-select-row]").nth(1).click();
    await page.locator("[data-select-row]").nth(2).click();
    const kind = page.locator("[data-bulk-action]");
    await expect(kind).toHaveAttribute("data-selection-kind", "rows");
    await page.locator("[data-header-sort=budget]").click();
    await expect(page).toHaveURL(/sort=budget/);
    await expect(kind).toHaveAttribute("data-selection-kind", "none");
    await page.locator("[data-select-row]").nth(1).click();
    await expect(kind).toHaveAttribute("data-selection-kind", "rows");
    await page.goto("/memory?group=team");
    await expect(page.locator("[data-group-toggle]").first()).toBeVisible();
    await expect(kind).toHaveAttribute("data-selection-kind", "none");
  });

  test("a client grid selects its rows by id", async ({ page }) => {
    await openGrid(page, "/memory");
    await page.locator("[data-select-all]").click();
    await expect(page.locator("[data-selection=rows]")).toHaveText(
      "400 selected",
    );
    await expect(page.locator("[data-select-matching]")).toHaveCount(0);
    await page.locator("[data-bulk-action]").click();
    await expect(note(page)).toHaveText("Bulk action on 400 rows by id");
  });
});

test.describe("row open and row actions", () => {
  test("a click on the row's link and Enter on any of its cells open it", async ({
    page,
  }) => {
    await openGrid(page, "/memory?sort=number.asc");
    await page.locator("[data-row-open]").first().click();
    await expect(note(page)).toHaveText(/^Opened /);
    const opened = await note(page).textContent();
    await page.locator('[data-row="2"] [data-field="team"]').click();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("[data-status=active]")).toHaveAttribute(
      "data-value",
      /^3:/,
    );
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(note(page)).not.toHaveText(opened ?? "");
    await expect(note(page)).toHaveText(/^Opened /);
    await expect(page.locator("[data-status=active]")).toHaveAttribute(
      "data-value",
      /^2:/,
    );
  });

  test("the actions menu opens from its button, runs an item and gives focus back", async ({
    page,
  }) => {
    await openGrid(page, "/memory?sort=number.asc");
    const trigger = page.locator("[data-row-actions]").first();
    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.locator("[data-part=row-actions-menu]");
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("role", "menu");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(note(page)).toHaveText(/^duplicate: /);
    await expect(menu).toBeHidden();
    await trigger.click();
    await menu.getByText("Open").click();
    await expect(note(page)).toHaveText(/^open: /);
    await trigger.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("the menu key on a cell opens that row's actions", async ({ page }) => {
    await openGrid(page, "/orders");
    await page.locator('[data-row="1"] [data-field="customer_name"]').click();
    await page.keyboard.press("Shift+F10");
    const menu = page.locator("[data-part=row-actions-menu]");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Enter");
    const order = await page
      .locator('[data-row="1"] [data-field="order_number"]')
      .textContent();
    await expect(note(page)).toHaveText(`open: ${order}`);
    await page.locator("[data-row-open]").nth(3).click();
    await expect(note(page)).toHaveText(/^Opened \d+$/);
  });
});

test.describe("row reorder", () => {
  const handles = (page: Page) => page.locator("[data-reorder-handle]");

  test("it is held, with the reason, until the grid is in its manual order", async ({
    page,
  }) => {
    await openGrid(page, "/memory");
    await expect(handles(page).first()).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(handles(page).first()).toHaveAttribute(
      "title",
      "Sort by Rank ascending, and by nothing else, to reorder.",
    );
    const before = await column(page, "number", 4);
    await handles(page).first().focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    expect(await column(page, "number", 4)).toEqual(before);
    await openGrid(page, "/memory?sort=rank.asc&group=team");
    await expect(handles(page)).toHaveCount(0);
    await expect(page.locator("[data-part=grid]")).toBeVisible();
  });

  test("the keyboard picks a row up, moves it and drops it, and the order is saved", async ({
    page,
  }) => {
    await openGrid(page, "/memory?sort=rank.asc");
    const before = await column(page, "number", 4);
    await expect(handles(page).first()).not.toHaveAttribute("aria-disabled");
    await handles(page).first().focus();
    await page.keyboard.press("Space");
    await expect(handles(page).nth(0)).toHaveAttribute("data-moving", "");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    await expect
      .poll(() => column(page, "number", 4))
      .toEqual([before[1], before[2], before[0], before[3]]);
    expect(await column(page, "rank", 4)).toEqual(["1", "2", "3", "4"]);
    await expect(handles(page).nth(2)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("[data-status=active]")).toHaveAttribute(
      "data-value",
      "none",
    );
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Escape");
    expect(await column(page, "number", 4)).toEqual([
      before[1],
      before[2],
      before[0],
      before[3],
    ]);
    await page.locator("[data-header-sort=number]").click();
    await page.locator("[data-header-sort=rank]").click();
    await page.locator("[data-header-sort=rank]").click();
    await expect(page).toHaveURL(/sort=rank\.asc/);
    await expect
      .poll(() => column(page, "number", 3))
      .toEqual([before[1], before[2], before[0]]);
  });

  test("a row is dragged by its handle to a new place", async ({ page }) => {
    await openGrid(page, "/memory?sort=rank.asc&f.team=growth");
    const before = await column(page, "number", 4);
    const from = await center(handles(page).nth(0));
    const to = await center(handles(page).nth(2));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 8, { steps: 2 });
    await page.mouse.move(to.x, to.y + 6, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(() => column(page, "number", 4))
      .toEqual([before[1], before[2], before[0], before[3]]);
    const ranks = (await column(page, "rank", 4)).map(Number);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

test.describe("ready-made cells", () => {
  test("a badge field and a list field render through the package's cells", async ({
    page,
  }) => {
    await openGrid(page, "/memory?f.priority=high&o.labels=bug");
    const badge = cells(page, "priority").first().locator(".qg-badge");
    await expect(badge).toHaveAttribute("data-tone", "danger");
    await expect(badge).toHaveText("High");
    const list = cells(page, "labels").first().locator(".qg-list-cell");
    await expect(list.locator(".qg-list-item").first()).toBeVisible();
    await expect(list).toContainText("Bug");
  });
});
