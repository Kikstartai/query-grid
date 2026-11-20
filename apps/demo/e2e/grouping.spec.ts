import type { Page } from "@playwright/test";

import {
  apiCount,
  bar,
  expect,
  loaded,
  openGrid,
  pick,
  scroller,
  test,
  texts,
} from "./fixtures";

const group = (page: Page, value: string) =>
  page.locator(`[data-group="${value}"]`);
const toggle = (page: Page, value: string) =>
  page.locator(`[data-group-toggle="${value}"]`);
const groupCount = (page: Page, value: string) =>
  page.locator(`[data-group-count="${value}"]`);
const dataRows = (page: Page) => page.locator("[data-row-id]");

async function groupBy(page: Page, field: string) {
  await bar(page).locator("[data-filter=group]").click();
  await page.locator(`[data-option="${field}"]`).click();
  await expect(page).toHaveURL(new RegExp(`group=${field}`));
}

async function scrollToEnd(page: Page) {
  await scroller(page).evaluate((element) =>
    element.scrollTo({ top: element.scrollHeight }),
  );
}

async function cells(page: Page, field: string): Promise<string[]> {
  return texts(page.locator(`.qg-cell[data-field=${field}]`));
}

test.describe("grouping by the counted field", () => {
  test("the headers come from the counter table and a collapsed group loads no rows", async ({
    page,
  }) => {
    const pages: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname === "/api/orders" && url.searchParams.has("limit")) {
        pages.push(url.search);
      }
    });
    await openGrid(page, "/orders");
    await groupBy(page, "status_code");
    await expect(page.locator("[data-group]")).toHaveCount(7);
    expect(
      await page
        .locator("[data-group]")
        .evaluateAll((rows) =>
          rows.map((row) => row.getAttribute("data-group")),
        ),
    ).toEqual([
      "completed",
      "shipped",
      "paid",
      "pending",
      "cancelled",
      "refunded",
      "failed",
    ]);
    const failed = await apiCount(page, "f.status_code.any_of=failed");
    await expect
      .poll(async () =>
        (await groupCount(page, "failed").textContent())?.replace(/\D/g, ""),
      )
      .toBe(String(failed));
    await expect(group(page, "failed")).toContainText("Total sum");
    await expect(group(page, "failed")).toContainText("Items sum");
    await expect(dataRows(page)).toHaveCount(0);
    await expect(page.locator('[data-chip="group"]')).toHaveText(
      /Group: Status/,
    );
    const before = pages.length;

    await toggle(page, "failed").click();
    await expect(toggle(page, "failed")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(loaded(page)).toHaveAttribute("data-value", "50");
    expect(pages.length).toBe(before + 1);
    expect(pages[before]).toContain("f.status_code.any_of=failed");
    expect(pages[before]).not.toContain("group=");
    expect(new Set(await cells(page, "status_code"))).toEqual(
      new Set(["Failed"]),
    );

    await scrollToEnd(page);
    await page.locator('[data-group-more="failed"]').click();
    await expect(loaded(page)).toHaveAttribute("data-value", "100");
    expect(pages[before + 1]).toContain("cursor=");

    await scroller(page).evaluate((element) => element.scrollTo({ top: 0 }));
    await toggle(page, "failed").click();
    await expect(dataRows(page)).toHaveCount(0);
    await toggle(page, "failed").click();
    await expect(loaded(page)).toHaveAttribute("data-value", "100");
    expect(pages.length).toBe(before + 2);

    await toggle(page, "refunded").click();
    await expect(loaded(page)).toHaveAttribute("data-value", "150");
    await expect
      .poll(async () => new Set(await cells(page, "status_code")).size)
      .toBeGreaterThanOrEqual(1);

    await page.locator('[data-chip-remove="group"]').click();
    await expect(page).not.toHaveURL(/group=/);
    await expect(page.locator("[data-group]")).toHaveCount(0);
    await expect(loaded(page)).toHaveAttribute("data-value", "500");
  });

  test("under another filter the headers fall back to capped live counts", async ({
    page,
  }) => {
    await openGrid(page, "/orders?f.region.any_of=gauteng&group=status_code");
    await expect(page.locator("[data-group]")).toHaveCount(7);
    await expect(groupCount(page, "completed")).toHaveText(/^10.000\+ rows$/);
    const failed = await apiCount(
      page,
      "f.region.any_of=gauteng&f.status_code.any_of=failed",
    );
    await expect
      .poll(async () =>
        (await groupCount(page, "failed").textContent())?.replace(/\D/g, ""),
      )
      .toBe(String(failed));
    await expect(group(page, "failed")).not.toContainText("Total sum");
    await toggle(page, "failed").click();
    await expect(loaded(page)).toHaveAttribute(
      "data-value",
      String(Math.min(failed, 50)),
    );
    expect(new Set(await cells(page, "region"))).toEqual(new Set(["Gauteng"]));
  });

  test("the group headers answer the keyboard", async ({ page }) => {
    await openGrid(page, "/orders?group=status_code");
    await toggle(page, "failed").focus();
    await page.keyboard.press("Enter");
    await expect(toggle(page, "failed")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(loaded(page)).toHaveAttribute("data-value", "50");
    await page.keyboard.press("Space");
    await expect(toggle(page, "failed")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});

test.describe("grouping by another equality field", () => {
  test("it is held on the whole table and offered over a narrowed set", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    await bar(page).locator("[data-filter=group]").click();
    await expect(page.locator('[data-option="region"]')).toHaveAttribute(
      "title",
      /^Narrow by .* first: 620.000 rows\.$/,
    );
    await expect(
      page.locator('[data-option="status_code"]'),
    ).not.toHaveAttribute("title", /.+/);
    await page.keyboard.press("Escape");

    await pick(page, "status_code", "failed");
    await expect
      .poll(async () => {
        await bar(page).locator("[data-filter=group]").click();
        const title = await page
          .locator('[data-option="region"]')
          .getAttribute("title");
        await page.keyboard.press("Escape");
        return title;
      })
      .toBeNull();
    await groupBy(page, "region");
    const failed = await apiCount(page, "f.status_code.any_of=failed");
    await expect
      .poll(async () => page.locator("[data-group]").count())
      .toBeGreaterThan(5);
    const response = await page.request.get(
      "/api/orders/groups?f.status_code.any_of=failed&group=region",
    );
    const body = (await response.json()) as {
      source: string;
      groups: { value: string; count: number }[];
    };
    expect(body.source).toBe("live");
    expect(body.groups.reduce((sum, item) => sum + item.count, 0)).toBe(failed);
    const [largest] = [...body.groups].sort((a, b) => b.count - a.count);
    await expect
      .poll(async () =>
        (await groupCount(page, largest.value).textContent())?.replace(
          /\D/g,
          "",
        ),
      )
      .toBe(String(largest.count));
    await toggle(page, largest.value).click();
    await expect(loaded(page)).toHaveAttribute("data-value", "50");
    expect(new Set(await cells(page, "status_code"))).toEqual(
      new Set(["Failed"]),
    );
    expect(new Set(await cells(page, "region")).size).toBe(1);
  });

  test("an empty value is its own group", async ({ page }) => {
    await openGrid(
      page,
      "/orders?f.created_at.in_period=last-30-days&group=assignee",
    );
    await expect(group(page, "_empty")).toContainText("(blank)");
    await expect(group(page, "glen")).toContainText("Glen Kitchen");
    await toggle(page, "_empty").click();
    await expect(loaded(page)).toHaveAttribute("data-value", "50");
    expect(new Set(await cells(page, "assignee"))).toEqual(new Set([""]));
  });

  test("a URL over the limit is refused with the way to get under it", async ({
    page,
  }) => {
    await page.goto("/orders?group=region");
    await expect(page.locator("[data-feed-state=error]")).toContainText(
      /more than 100.000 rows/,
    );
    const refused = await page.request.get("/api/orders/groups?group=region");
    expect(refused.status()).toBe(400);
    expect(((await refused.json()) as { code: string }).code).toBe(
      "narrow_first",
    );
    const unknown = await page.request.get(
      "/api/orders/groups?group=customer_name",
    );
    expect(unknown.status()).toBe(400);
  });
});

test.describe("grouping in the in-memory grid", () => {
  test("any equality field groups, with counts that add up and rows per group", async ({
    page,
  }) => {
    await openGrid(page, "/memory");
    await groupBy(page, "team");
    await expect(page.locator("[data-group]")).toHaveCount(4);
    const counts = await page
      .locator("[data-group-count]")
      .evaluateAll((items) =>
        items.map((item) => Number(item.textContent?.replace(/\D/g, ""))),
      );
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(400);
    await toggle(page, "billing").click();
    await expect(loaded(page)).toHaveAttribute("data-value", "50");
    expect(new Set(await cells(page, "team"))).toEqual(new Set(["Billing"]));
    await pick(page, "status", "todo");
    await expect(page).toHaveURL(/group=team/);
    await expect(toggle(page, "billing")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});

test.describe("grouping under right to left", () => {
  test("the headers render and the collapsed chevron mirrors", async ({
    page,
  }) => {
    await openGrid(page, "/rtl?group=status_code");
    await expect(page.locator("[data-group]")).toHaveCount(7);
    const chevron = toggle(page, "failed").locator(".qg-group-chevron");
    expect(
      await chevron.evaluate((element) => getComputedStyle(element).transform),
    ).toBe("matrix(-1, 0, 0, 1, 0, 0)");
    const [cellBox, gridBox] = await Promise.all([
      toggle(page, "failed").boundingBox(),
      scroller(page).boundingBox(),
    ]);
    expect(cellBox!.x + cellBox!.width).toBeGreaterThan(
      gridBox!.x + gridBox!.width / 2,
    );
    await toggle(page, "failed").click();
    await expect(loaded(page)).toHaveAttribute("data-value", "50");
  });
});
