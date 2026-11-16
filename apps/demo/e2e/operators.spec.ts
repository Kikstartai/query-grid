import type { Page } from "@playwright/test";

import {
  apiCount,
  bar,
  countValue,
  expect,
  expectCount,
  loaded,
  openGrid,
  pick,
  search,
  test,
  texts,
} from "./fixtures";

const ORDERS = 620000;

function chip(page: Page, id: string) {
  return page.locator(`[data-chip="${id}"]`);
}

async function cells(page: Page, field: string): Promise<string[]> {
  return texts(page.locator(`.qg-cell[data-field=${field}]`));
}

async function apiValues(
  page: Page,
  query: string,
  field: string,
): Promise<unknown[]> {
  const response = await page.request.get(`/api/orders?${query}&limit=1000`);
  expect(response.status()).toBe(200);
  const { rows } = (await response.json()) as {
    rows: Record<string, unknown>[];
  };
  return [...new Set(rows.map((row) => row[field]))].sort();
}

async function pickPeriod(page: Page, field: string, option: string) {
  await bar(page).locator(`[data-filter="${field}.preset"]`).click();
  await page.locator(`[data-option="${option}"]`).click();
}

test.describe("is empty and is not empty", () => {
  test("empty reads the rows with no assignee and mixes with a name", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    await pick(page, "assignee", "_empty");
    await expect(chip(page, "eq:assignee")).toContainText("(empty)");
    await expectCount(
      page,
      Math.min(await apiCount(page, "f.assignee=_empty"), 10000),
      "capped",
    );
    await expect
      .poll(async () => [...new Set(await cells(page, "assignee"))])
      .toEqual([""]);

    await pick(page, "assignee", "wanjiru");
    await expect(page).toHaveURL(/f\.assignee=_empty&f\.assignee=wanjiru/);
    await expect(
      chip(page, "eq:assignee").locator(".qg-chip-value"),
    ).toHaveText(["(empty)", "Wanjiru Otieno"]);
    await expectCount(page, 10000, "capped");
    expect(
      new Set(
        await apiValues(
          page,
          "f.assignee=_empty&f.assignee=wanjiru",
          "assignee",
        ),
      ),
    ).toEqual(new Set(["wanjiru", null]));
  });

  test("not empty stands alone: it drops the other values and a value drops it", async ({
    page,
  }) => {
    await openGrid(page, "/orders?f.assignee=glen");
    await pick(page, "assignee", "_not_empty");
    await expect(page).not.toHaveURL(/f\.assignee=glen/);
    await expect(chip(page, "eq:assignee")).toContainText("(not empty)");
    await expect
      .poll(async () => {
        const shown = await cells(page, "assignee");
        return shown.length > 0 && !shown.includes("");
      })
      .toBe(true);
    const assigned = await apiValues(page, "f.assignee=_not_empty", "assignee");
    expect(assigned.length).toBeGreaterThan(1);
    expect(assigned).not.toContain(null);

    await pick(page, "assignee", "lerato");
    await expect(page).not.toHaveURL(/_not_empty/);
    await expect
      .poll(async () => [...new Set(await cells(page, "assignee"))])
      .toEqual(["Lerato Mokoena"]);
  });

  test("a field that is never empty offers neither option, and the server refuses the token", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    await bar(page).locator('[data-filter="region"]').click();
    await expect(page.locator('[data-option="gauteng"]')).toBeVisible();
    await expect(page.locator('[data-option="_empty"]')).toHaveCount(0);
    await page.keyboard.press("Escape");
    const refused = await page.request.get("/api/orders?f.region=_empty");
    expect(refused.status()).toBe(400);
    const mixed = await page.request.get(
      "/api/orders?f.assignee=_not_empty&f.assignee=glen",
    );
    expect(mixed.status()).toBe(400);
  });
});

test.describe("exclude", () => {
  test("the toggle turns the chosen values into the ones left out, and the URL keeps the intent", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    const toggle = bar(page).locator('[data-filter-exclude="status_code"]');
    await expect(toggle).toBeDisabled();
    await pick(page, "status_code", "cancelled");
    await expect(chip(page, "eq:status_code")).toContainText("Status:");
    const cancelled = await apiCount(page, "f.status_code=cancelled");

    const expanded = page.waitForRequest(
      (request) =>
        request.url().includes("/api/orders?") &&
        request.url().includes("f.status_code=completed"),
    );
    await toggle.click();
    await expect(page).toHaveURL(/f\.status_code=(!|%21)cancelled/);
    const sent = new URL((await expanded).url()).searchParams;
    expect(sent.getAll("f.status_code").sort()).toEqual([
      "completed",
      "failed",
      "paid",
      "pending",
      "refunded",
      "shipped",
    ]);
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(chip(page, "eq:status_code")).toContainText("Status ≠");
    await expect(chip(page, "eq:status_code")).toContainText("Cancelled");
    await expectCount(page, ORDERS - cancelled);
    await expect
      .poll(async () =>
        (await cells(page, "status_code")).includes("Cancelled"),
      )
      .toBe(false);

    await bar(page).locator('[data-filter="status_code"]').click();
    await page.locator('[data-option="completed"]').click();
    await expect(page).toHaveURL(
      /f\.status_code=(!|%21)cancelled&f\.status_code=(!|%21)completed/,
    );
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(chip(page, "eq:status_code")).toContainText("Status ≠");
    await expect(
      chip(page, "eq:status_code").locator(".qg-chip-value"),
    ).toHaveCount(2);

    await bar(page).locator('[data-filter-exclude="status_code"]').click();
    await expect(page).toHaveURL(
      /f\.status_code=cancelled&f\.status_code=completed/,
    );
    await expect(chip(page, "eq:status_code")).toContainText("Status:");
  });

  test("removing an excluded value from its chip keeps the rest excluded", async ({
    page,
  }) => {
    await openGrid(
      page,
      "/orders?f.status_code=!cancelled&f.status_code=!failed",
    );
    await page
      .locator('[data-chip-remove="eq:status_code"][data-chip-value="failed"]')
      .click();
    await expect(page).not.toHaveURL(/failed/);
    await expect(page).toHaveURL(/f\.status_code=(!|%21)cancelled/);
    await expect(page.locator('[data-facet="cancelled"]')).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.locator('[data-facet="failed"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("a lookup field has no toggle, and the server never sees the intent", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    await expect(
      bar(page).locator('[data-filter-exclude="customer_id"]'),
    ).toHaveCount(0);
    const refused = await page.request.get(
      "/api/orders?f.status_code=!cancelled",
    );
    expect(refused.status()).toBe(400);
    expect(((await refused.json()) as { code: string }).code).toBe(
      "invalid_value",
    );
  });
});

test.describe("date presets", () => {
  test.use({ timezoneId: "Pacific/Auckland" });

  test("a preset is whole days in the viewer's time zone, and the URL stores its name", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    const bounded = page.waitForRequest(
      (request) =>
        request.url().includes("/api/orders?") &&
        request.url().includes("r.created_at="),
    );
    await pickPeriod(page, "created_at", "last-7-days");
    await expect(page).toHaveURL(/r\.created_at=last-7-days/);
    await expect(chip(page, "range:created_at")).toHaveText(
      /Created: Last 7 days/,
    );
    const sent = new URL((await bounded).url()).searchParams.get(
      "r.created_at",
    );
    const expected = await page.evaluate(() => {
      const now = new Date();
      const first = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 6,
      );
      const afterLast = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
      return {
        zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        min: first.toISOString(),
        max: new Date(afterLast.getTime() - 1)
          .toISOString()
          .replace(".999Z", ".999999Z"),
      };
    });
    expect(expected.zone).toBe("Pacific/Auckland");
    expect(sent).toBe(`${expected.min}..${expected.max}`);
    expect(expected.min).not.toContain("T00:00:00");
    await expect(
      bar(page).locator('[data-filter="created_at.min"]'),
    ).toHaveCount(0);

    await pickPeriod(page, "created_at", "this-year");
    await expect(page).toHaveURL(/r\.created_at=this-year/);
    await expect(chip(page, "range:created_at")).toHaveText(
      /Created: This year/,
    );
  });

  test("Custom… shows the date picker and clears the preset", async ({
    page,
  }) => {
    await openGrid(page, "/orders?r.created_at=last-30-days");
    await expect(chip(page, "range:created_at")).toHaveText(
      /Created: Last 30 days/,
    );
    await pickPeriod(page, "created_at", "custom");
    await expect(page).not.toHaveURL(/r\.created_at/);
    await expect(
      bar(page).locator('[data-filter="created_at.min"]'),
    ).toBeVisible();
    await bar(page).locator('[data-filter="created_at.calendar"]').click();
    await expect(
      page.locator("[role=dialog], [role=grid]").first(),
    ).toBeVisible();
  });

  test("a custom range in the URL opens as Custom…", async ({ page }) => {
    await openGrid(
      page,
      "/orders?r.created_at=2026-01-01T00:00:00.000000Z..2026-01-31T23:59:59.999999Z",
    );
    await expect(
      bar(page).locator('[data-filter="created_at.preset"]'),
    ).toContainText("Custom…");
    await expect(
      bar(page).locator('[data-filter="created_at.min"]'),
    ).toBeVisible();
    await bar(page).locator('[data-filter-clear="created_at"]').click();
    await expect(page).not.toHaveURL(/r\.created_at/);
  });

  test("the in-memory grid takes the same presets", async ({ page }) => {
    await openGrid(page, "/memory");
    await pickPeriod(page, "due_at", "this-year");
    await expect(page).toHaveURL(/r\.due_at=this-year/);
    await expect(chip(page, "range:due_at")).toHaveText(/This year/);
  });
});

test.describe("search with equality filters", () => {
  test("a filter narrows the search, the matches sort, and the facet counts hide", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    await search(page, "mokoena");
    await expect(countValue(page)).toHaveText(/^500\+ rows$/);
    await pick(page, "status_code", "failed");
    await expect(page).toHaveURL(/f\.status_code=failed/);
    await expect(page).toHaveURL(/q=mokoena/);
    const matches = await apiCount(page, "q=mokoena&f.status_code=failed");
    expect(matches).toBeGreaterThan(0);
    expect(matches).toBeLessThan(500);
    await expectCount(page, matches, "capped");
    await expect(loaded(page)).toHaveAttribute("data-value", String(matches));
    expect(new Set(await cells(page, "status_code"))).toEqual(
      new Set(["Failed"]),
    );
    for (const name of await cells(page, "customer_name")) {
      expect(name.toLowerCase()).toContain("mokoena");
    }
    await expect(
      page.locator('[data-facet="failed"] [data-facet-count]'),
    ).toHaveText("");

    await page.locator('[data-header-sort="total"]').click();
    await expect(page).toHaveURL(/sort=total\.desc/);
    await expect
      .poll(async () => {
        const totals = await page
          .locator(".qg-cell[data-field=total]")
          .evaluateAll((list) =>
            list.map((cell) =>
              Number(
                cell.textContent?.replace(/[^\d,]/g, "").replace(",", "."),
              ),
            ),
          );
        return (
          totals.length > 1 &&
          totals.join() === [...totals].sort((a, b) => b - a).join()
        );
      })
      .toBe(true);
  });

  test("an excluded value and an empty value combine with the search, and a range does not", async ({
    page,
  }) => {
    await openGrid(page, "/orders?q=smith&f.status_code=!completed");
    await expect(chip(page, "eq:status_code")).toContainText("Status ≠");
    await expect
      .poll(async () => (await cells(page, "status_code")).length)
      .toBeGreaterThan(0);
    expect(await cells(page, "status_code")).not.toContain("Completed");

    await pick(page, "assignee", "_empty");
    await expect(page).toHaveURL(/q=smith/);
    await expect
      .poll(async () => [...new Set(await cells(page, "assignee"))])
      .toEqual([""]);

    const period = bar(page).locator('[data-field="created_at"]');
    await expect(period).toHaveAttribute("data-unavailable", "");
    await expect(period).toHaveAttribute("title", /equality filters only/);
    const refused = await page.request.get(
      "/api/orders?q=smith&r.created_at=2026-01-01T00:00:00Z..",
    );
    expect(refused.status()).toBe(400);
  });

  test("the search stays offered beside a filter and is held beside a range", async ({
    page,
  }) => {
    await openGrid(page, "/orders?f.region=gauteng");
    await expect(bar(page).locator("[data-filter=search]")).toBeEnabled();
    await search(page, "smith");
    await expect(page).toHaveURL(/f\.region=gauteng/);
    await expect(page).toHaveURL(/q=smith/);
    await openGrid(page, "/orders?r.created_at=last-7-days");
    await expect(bar(page).locator("[data-filter=search]")).toBeDisabled();
    await expect(bar(page).locator("[data-field=search]")).toHaveAttribute(
      "title",
      /range/,
    );
  });
});

test.describe("the narrowed-set tier", () => {
  const field = (page: Page, name: string) =>
    bar(page).locator(`[data-field="${name}"]`);

  async function setContains(page: Page, key: string, text: string) {
    await bar(page)
      .locator('[data-text-row="0"] [data-filter="text.field"]')
      .click();
    await page.locator(`[data-option="${key}"]`).click();
    const input = bar(page).locator('[data-text-row="0"] [data-filter="text"]');
    await input.fill(text);
    await input.press("Enter");
  }

  test("on the whole table the expensive controls are held with the size, and narrowing frees them", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    await expect(field(page, "total")).toHaveAttribute(
      "title",
      /^Narrow by Status or Customer account first: 620.000 rows\.$/,
    );
    await expect(field(page, "total")).toHaveAttribute("data-unavailable", "");
    await expect(field(page, "created_at")).not.toHaveAttribute(
      "data-unavailable",
      "",
    );
    await expect(field(page, "text")).not.toHaveAttribute(
      "data-unavailable",
      "",
    );
    await bar(page)
      .locator('[data-text-row="0"] [data-filter="text.field"]')
      .click();
    const note = page.locator('[data-option="note"]');
    await expect(note).toHaveAttribute("aria-disabled", "true");
    await expect(note).toHaveAttribute(
      "title",
      /^Narrow by Status or Customer account first: 620.000 rows\.$/,
    );
    await page.keyboard.press("Escape");

    await pick(page, "status_code", "failed");
    await expect(field(page, "total")).not.toHaveAttribute(
      "data-unavailable",
      "",
    );
    await setContains(page, "note", "gift");
    await expect(page).toHaveURL(/c\.note=gift/);
    await expect(chip(page, "text:0")).toHaveText(/Note contains “gift”/);
    const matches = await apiCount(page, "f.status_code=failed&c.note=gift");
    expect(matches).toBeGreaterThan(0);
    await expectCount(page, matches, "capped");
    for (const note of await cells(page, "note")) {
      expect(note.toLowerCase()).toContain("gift");
    }

    const min = bar(page).locator('[data-filter="total.min"]');
    await min.fill("200");
    await min.press("Enter");
    await expect(page).toHaveURL(/r\.total=20000\.\./);
    await expectCount(
      page,
      await apiCount(page, "f.status_code=failed&c.note=gift&r.total=20000.."),
      "capped",
    );
    await expect(page.locator("[data-chip]")).toHaveCount(4);

    await page.locator('[data-chip-remove="text:0"]').click();
    await expect(page).not.toHaveURL(/c\.note/);
    await expect(
      bar(page).locator('[data-text-row="0"] [data-filter="text"]'),
    ).toHaveValue("");
  });

  test("match any unions two filters when their rows fit the limit, and is held when they do not", async ({
    page,
  }) => {
    await openGrid(page, "/orders?f.status_code=failed&f.channel=phone");
    const both = await apiCount(page, "f.status_code=failed&f.channel=phone");
    const any = bar(page).locator('[data-match="any"]');
    await expect(any).toBeEnabled();
    await any.click();
    await expect(page).toHaveURL(/match=any/);
    await expect(chip(page, "match")).toHaveText(/Match any/);
    const either = await apiCount(
      page,
      "f.status_code=failed&f.channel=phone&match=any",
    );
    expect(either).toBeGreaterThan(both);
    await expectCount(page, either, "capped");
    const rows = await page.request.get(
      "/api/orders?f.status_code=failed&f.channel=phone&match=any&limit=1000",
    );
    const body = (await rows.json()) as {
      rows: { status_code: string; channel: string }[];
    };
    expect(
      body.rows.every(
        (row) => row.status_code === "failed" || row.channel === "phone",
      ),
    ).toBe(true);
    expect(body.rows.some((row) => row.status_code !== "failed")).toBe(true);

    await bar(page).locator('[data-match="all"]').click();
    await expect(page).not.toHaveURL(/match=any/);
    await expectCount(page, both, "capped");

    await openGrid(page, "/orders?f.status_code=completed&f.region=gauteng");
    await expect(bar(page).locator('[data-match="any"]')).toBeDisabled();
    await expect(field(page, "match")).toHaveAttribute(
      "title",
      /^Narrow the filters first: .* rows\.$/,
    );
  });

  test("a URL over the limit is refused by the server and says how to get under it", async ({
    page,
  }) => {
    await page.goto("/orders?c.note=gift");
    await expect(page.locator("[data-feed-state=error]")).toContainText(
      /more than 100.000 rows/,
    );
    const refused = await page.request.get("/api/orders?c.note=gift");
    expect(refused.status()).toBe(400);
    expect(await refused.json()).toMatchObject({
      code: "narrow_first",
      params: { limit: 100000 },
    });
    await pick(page, "status_code", "failed");
    await expect(page.locator("[data-feed-state=error]")).toHaveCount(0);
    await expect(loaded(page)).toBeVisible();
    for (const text of await cells(page, "note")) {
      expect(text.toLowerCase()).toContain("gift");
    }
  });

  test("the sidebar spells the reason out under each held control", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    await page.locator("[data-part=filter-sidebar-trigger]").click();
    const sidebar = page.locator("[data-part=filter-sidebar]");
    await expect(
      sidebar.locator('[data-field="total"] [data-field-reason]'),
    ).toHaveText(/Narrow by Status or Customer account first/);
    await expect(
      sidebar.locator('[data-field="text"] [data-field-reason]'),
    ).toHaveCount(0);
    await expect(
      sidebar.locator('[data-field="item_count"] [data-field-reason]'),
    ).toHaveText(/Narrow by/);
  });

  test("the limits the host set are served, and the sizes behind the controls", async ({
    page,
  }) => {
    const limits = await page.request.get("/api/orders/limits");
    expect(await limits.json()).toEqual({
      pageLimit: 200,
      countCap: 10000,
      searchLimit: 500,
      searchBudgetMs: 120,
      narrowLimit: 100000,
      exportLimit: 50000,
    });
    const sizes = await page.request.get(
      "/api/orders/narrowed?f.status_code=failed&f.channel=phone",
    );
    const body = (await sizes.json()) as {
      limit: number;
      all: { rows: number; over: boolean };
      any: { rows: number; over: boolean };
    };
    expect(body.limit).toBe(100000);
    expect(body.all.over).toBe(false);
    expect(body.any.rows).toBeGreaterThan(body.all.rows);
  });

  test("the in-memory grid takes contains, a second range and match any with no limit", async ({
    page,
  }) => {
    await openGrid(page, "/memory");
    await expect(field(page, "text")).not.toHaveAttribute(
      "data-unavailable",
      "",
    );
    const input = bar(page).locator('[data-text-row="0"] [data-filter="text"]');
    await input.fill("fix");
    await input.press("Enter");
    await expect(page).toHaveURL(/c\.title=fix/);
    await expect
      .poll(async () => {
        const titles = await cells(page, "title");
        return (
          titles.length > 0 &&
          titles.every((title) => title.toLowerCase().includes("fix"))
        );
      })
      .toBe(true);
    const narrowed = Number(await countValue(page).getAttribute("data-count"));
    await pick(page, "status", "todo");
    const all = Number(await countValue(page).getAttribute("data-count"));
    await bar(page).locator('[data-match="any"]').click();
    await expect(page).toHaveURL(/match=any/);
    await expect
      .poll(async () =>
        Number(await countValue(page).getAttribute("data-count")),
      )
      .toBeGreaterThan(narrowed);
    expect(all).toBeLessThanOrEqual(narrowed);
  });
});

test.describe("right to left", () => {
  test("the new controls and chips render under dir=rtl", async ({ page }) => {
    await openGrid(
      page,
      "/rtl?f.status_code=!cancelled&r.created_at=last-7-days",
    );
    await expect(chip(page, "eq:status_code")).toContainText("Status ≠");
    await expect(chip(page, "range:created_at")).toHaveText(
      /Created: Last 7 days/,
    );
    const toggle = bar(page).locator('[data-filter-exclude="status_code"]');
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const [toggleBox, triggerBox] = await Promise.all([
      toggle.boundingBox(),
      bar(page).locator('[data-filter="status_code"]').boundingBox(),
    ]);
    expect(toggleBox!.x).toBeGreaterThan(triggerBox!.x);
    await openGrid(page, "/rtl?f.assignee=_empty");
    await expect(chip(page, "eq:assignee")).toContainText("(empty)");
  });
});
