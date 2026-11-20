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

function option(page: Page, value: string) {
  return page.locator(`[data-option="${value}"]:visible`);
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

async function chooseOp(page: Page, field: string, op: string) {
  await bar(page).locator(`[data-filter="${field}.op"]`).click();
  await option(page, op).click();
}

async function pickPeriod(page: Page, field: string, preset: string) {
  await bar(page).locator(`[data-filter="${field}.preset"]`).click();
  await option(page, preset).click();
}

test.describe("the operator select", () => {
  test("each field lists the operators its kind takes, and a held one says why", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    const listOps = async (field: string) => {
      await bar(page).locator(`[data-filter="${field}.op"]`).click();
      const ops = await page
        .locator("[data-option]:visible")
        .evaluateAll((list) =>
          list.map((item) => item.getAttribute("data-option")),
        );
      await page.keyboard.press("Escape");
      return ops;
    };
    await expect(
      bar(page).locator('[data-field="status_code"]'),
    ).toHaveAttribute("data-kind", "choice");
    expect(await listOps("status_code")).toEqual(["any_of", "none_of"]);
    expect(await listOps("assignee")).toEqual([
      "any_of",
      "none_of",
      "blank",
      "not_blank",
    ]);
    await expect(
      bar(page).locator('[data-field="created_at"]'),
    ).toHaveAttribute("data-kind", "date");
    expect(await listOps("created_at")).toEqual([
      "equals",
      "not_equals",
      "greater_than",
      "greater_or_equal",
      "less_than",
      "less_or_equal",
      "between",
      "not_between",
      "in_period",
    ]);
    expect(await listOps("customer_name")).toEqual([
      "equals",
      "not_equals",
      "contains",
      "not_contains",
      "starts_with",
      "ends_with",
    ]);

    await bar(page).locator('[data-filter="customer_id.op"]').click();
    await expect(option(page, "none_of")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(option(page, "none_of")).toHaveAttribute(
      "title",
      /^Narrow by Status or Region first: 620.000 rows\.$/,
    );
    await expect(option(page, "any_of")).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("a URL in the old shape is ignored, and the grid opens on the default query", async ({
    page,
  }) => {
    await openGrid(page, "/orders?r.total=5..9&f.status_code=paid");
    await expect(page.locator("[data-chip]")).toHaveCount(1);
    await expect(chip(page, "sort")).toBeVisible();
    await expectCount(page, ORDERS);
    await expect(page.locator("[data-feed-state=error]")).toHaveCount(0);
    await expect(
      bar(page).locator('[data-filter="status_code"]'),
    ).not.toContainText("Paid");
  });
});

test.describe("blank and not blank", () => {
  test("blank reads the rows with no assignee, and any of mixes the blank with a name", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    await chooseOp(page, "assignee", "blank");
    await expect(page).toHaveURL(/f\.assignee\.blank=(&|$)/);
    await expect(chip(page, "filter:assignee:blank")).toHaveText(
      "Assignee blank",
    );
    await expect(bar(page).locator('[data-filter="assignee"]')).toHaveCount(0);
    await expectCount(
      page,
      Math.min(await apiCount(page, "f.assignee.blank="), 10000),
      "capped",
    );
    await expect
      .poll(async () => [...new Set(await cells(page, "assignee"))])
      .toEqual([""]);

    await chooseOp(page, "assignee", "any_of");
    await expect(page).not.toHaveURL(/f\.assignee/);
    await bar(page).locator('[data-filter="assignee"]').click();
    await page.getByRole("option", { name: "(blank)", exact: true }).click();
    await expect(page).toHaveURL(/f\.assignee\.any_of=_empty/);
    await option(page, "wanjiru").click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(
      /f\.assignee\.any_of=_empty&f\.assignee\.any_of=wanjiru/,
    );
    await expect(
      chip(page, "filter:assignee:any_of").locator(".qg-chip-value"),
    ).toHaveText(["(blank)", "Wanjiru Otieno"]);
    await expect(chip(page, "filter:assignee:any_of")).toContainText(
      "Assignee any of:",
    );
    await expectCount(page, 10000, "capped");
    expect(
      new Set(
        await apiValues(
          page,
          "f.assignee.any_of=_empty&f.assignee.any_of=wanjiru",
          "assignee",
        ),
      ),
    ).toEqual(new Set(["wanjiru", null]));
  });

  test("not blank replaces the values, and a value replaces it", async ({
    page,
  }) => {
    await openGrid(page, "/orders?f.assignee.any_of=glen");
    await chooseOp(page, "assignee", "not_blank");
    await expect(page).toHaveURL(/f\.assignee\.not_blank=/);
    await expect(page).not.toHaveURL(/any_of=glen/);
    await expect(chip(page, "filter:assignee:not_blank")).toHaveText(
      "Assignee not blank",
    );
    await expect
      .poll(async () => {
        const shown = await cells(page, "assignee");
        return shown.length > 0 && !shown.includes("");
      })
      .toBe(true);
    const assigned = await apiValues(page, "f.assignee.not_blank=", "assignee");
    expect(assigned.length).toBeGreaterThan(1);
    expect(assigned).not.toContain(null);

    await chooseOp(page, "assignee", "any_of");
    await pick(page, "assignee", "lerato");
    await expect(page).not.toHaveURL(/not_blank/);
    await expect
      .poll(async () => [...new Set(await cells(page, "assignee"))])
      .toEqual(["Lerato Mokoena"]);
  });

  test("a field that is never blank offers neither, and the server refuses them", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    await bar(page).locator('[data-filter="region.op"]').click();
    await expect(option(page, "any_of")).toBeVisible();
    await expect(option(page, "blank")).toHaveCount(0);
    await expect(option(page, "not_blank")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await bar(page).locator('[data-filter="region"]').click();
    await expect(option(page, "gauteng")).toBeVisible();
    await expect(
      page.getByRole("option", { name: "(blank)", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    const refused = await page.request.get("/api/orders?f.region.blank=");
    expect(refused.status()).toBe(400);
    expect(await refused.json()).toMatchObject({
      code: "invalid_op",
      params: { field: "region", op: "blank" },
    });
    const blankRegion = await page.request.get(
      "/api/orders?f.region.any_of=_empty",
    );
    expect(blankRegion.status()).toBe(400);
  });
});

test.describe("none of", () => {
  test("none of on a fixed list is sent as the values left, and the URL keeps the intent", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    const cancelled = await apiCount(page, "f.status_code.any_of=cancelled");
    await chooseOp(page, "status_code", "none_of");
    await expect(page).not.toHaveURL(/f\.status_code/);

    const expanded = page.waitForRequest(
      (request) =>
        request.url().includes("/api/orders?") &&
        request.url().includes("f.status_code.any_of=completed"),
    );
    await bar(page).locator('[data-filter="status_code"]').click();
    await option(page, "cancelled").click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/f\.status_code\.none_of=cancelled/);
    const sent = new URL((await expanded).url()).searchParams;
    expect(sent.getAll("f.status_code.any_of").sort()).toEqual([
      "completed",
      "failed",
      "paid",
      "pending",
      "refunded",
      "shipped",
    ]);
    expect(sent.has("f.status_code.none_of")).toBe(false);
    await expect(chip(page, "filter:status_code:none_of")).toContainText(
      "Status none of:",
    );
    await expect(chip(page, "filter:status_code:none_of")).toContainText(
      "Cancelled",
    );
    await expectCount(page, ORDERS - cancelled);
    await expect
      .poll(async () =>
        (await cells(page, "status_code")).includes("Cancelled"),
      )
      .toBe(false);

    await bar(page).locator('[data-filter="status_code"]').click();
    await option(page, "completed").click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(
      /f\.status_code\.none_of=cancelled&f\.status_code\.none_of=completed/,
    );
    await page.reload();
    await expect(chip(page, "filter:status_code:none_of")).toBeVisible();
    await expect(
      chip(page, "filter:status_code:none_of").locator(".qg-chip-value"),
    ).toHaveCount(2);

    await chooseOp(page, "status_code", "any_of");
    await expect(page).toHaveURL(
      /f\.status_code\.any_of=cancelled&f\.status_code\.any_of=completed/,
    );
    await expect(chip(page, "filter:status_code:any_of")).toContainText(
      "Status any of:",
    );
  });

  test("removing a value from a none of chip keeps the rest left out", async ({
    page,
  }) => {
    await openGrid(
      page,
      "/orders?f.status_code.none_of=cancelled&f.status_code.none_of=failed",
    );
    await page
      .locator(
        '[data-chip-remove="filter:status_code:none_of"][data-chip-value="failed"]',
      )
      .click();
    await expect(page).not.toHaveURL(/failed/);
    await expect(page).toHaveURL(/f\.status_code\.none_of=cancelled/);
    await expect(page.locator('[data-facet="cancelled"]')).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.locator('[data-facet="failed"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("the server never sees none of on a fixed list, or a period", async ({
    page,
  }) => {
    for (const query of [
      "f.status_code.none_of=cancelled",
      "f.created_at.in_period=last-7-days",
    ]) {
      const refused = await page.request.get(`/api/orders?${query}`);
      expect(refused.status()).toBe(400);
      const body = (await refused.json()) as { error: string; code: string };
      expect(body.error).toBe("invalid_value");
      expect(body.code).toBe("literal_required");
    }
  });
});

test.describe("in period", () => {
  test.use({ timezoneId: "Pacific/Auckland" });

  test("a period is whole days in the viewer's time zone, and the URL stores its name", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    const bounded = page.waitForRequest(
      (request) =>
        request.url().includes("/api/orders?") &&
        request.url().includes("f.created_at.between="),
    );
    await pickPeriod(page, "created_at", "last-7-days");
    await expect(page).toHaveURL(/f\.created_at\.in_period=last-7-days/);
    await expect(chip(page, "filter:created_at:in_period")).toHaveText(
      "Created in period Last 7 days",
    );
    const sent = new URL((await bounded).url()).searchParams.get(
      "f.created_at.between",
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
    await expect(page).toHaveURL(/f\.created_at\.in_period=this-year/);
    await expect(chip(page, "filter:created_at:in_period")).toHaveText(
      "Created in period This year",
    );
  });

  test("switching to between shows the date picker and drops the period", async ({
    page,
  }) => {
    await openGrid(page, "/orders?f.created_at.in_period=last-30-days");
    await expect(chip(page, "filter:created_at:in_period")).toHaveText(
      /Last 30 days/,
    );
    await chooseOp(page, "created_at", "between");
    await expect(page).not.toHaveURL(/f\.created_at/);
    await expect(
      bar(page).locator('[data-filter="created_at.preset"]'),
    ).toHaveCount(0);
    await expect(
      bar(page).locator('[data-filter="created_at.min"]'),
    ).toBeVisible();
    await bar(page).locator('[data-filter="created_at.calendar"]').click();
    await expect(
      page.locator("[role=dialog], [role=grid]").first(),
    ).toBeVisible();
  });

  test("a between range in the URL opens on between, and clears", async ({
    page,
  }) => {
    await openGrid(
      page,
      "/orders?f.created_at.between=2026-01-01T00:00:00.000000Z..2026-01-31T23:59:59.999999Z",
    );
    await expect(
      bar(page).locator('[data-filter="created_at.op"]'),
    ).toContainText("between");
    await expect(
      bar(page).locator('[data-filter="created_at.min"]'),
    ).toBeVisible();
    await expect(chip(page, "filter:created_at:between")).toHaveText(
      "Created between 2026-01-01 and 2026-01-31",
    );
    await page
      .locator('[data-chip-remove="filter:created_at:between"]')
      .click();
    await expect(page).not.toHaveURL(/f\.created_at/);
    await expect(chip(page, "filter:created_at:between")).toHaveCount(0);
  });

  test("the in-memory grid takes the same periods", async ({ page }) => {
    await openGrid(page, "/memory");
    await pickPeriod(page, "due_at", "this-year");
    await expect(page).toHaveURL(/f\.due_at\.in_period=this-year/);
    await expect(chip(page, "filter:due_at:in_period")).toHaveText(/This year/);
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
    await expect(page).toHaveURL(/f\.status_code\.any_of=failed/);
    await expect(page).toHaveURL(/q=mokoena/);
    const matches = await apiCount(
      page,
      "q=mokoena&f.status_code.any_of=failed",
    );
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

  test("none of and blank combine with the search, and a range does not", async ({
    page,
  }) => {
    await openGrid(page, "/orders?q=smith&f.status_code.none_of=completed");
    await expect(chip(page, "filter:status_code:none_of")).toContainText(
      "Status none of:",
    );
    await expect
      .poll(async () => (await cells(page, "status_code")).length)
      .toBeGreaterThan(0);
    expect(await cells(page, "status_code")).not.toContain("Completed");

    await openGrid(page, "/orders?q=smith");
    await chooseOp(page, "assignee", "blank");
    await expect(page).toHaveURL(/q=smith/);
    await expect(page).toHaveURL(/f\.assignee\.blank=/);
    await expect
      .poll(async () => [...new Set(await cells(page, "assignee"))])
      .toEqual([""]);

    const period = bar(page).locator('[data-field="created_at"]');
    await expect(period).toHaveAttribute("data-unavailable", "");
    await expect(period).toHaveAttribute("title", /equality filters only/);
    const refused = await page.request.get(
      "/api/orders?q=smith&f.created_at.greater_or_equal=2026-01-01T00:00:00Z",
    );
    expect(refused.status()).toBe(400);
  });

  test("the search stays offered beside a filter and is held beside a range", async ({
    page,
  }) => {
    await openGrid(page, "/orders?f.region.any_of=gauteng");
    await expect(bar(page).locator("[data-filter=search]")).toBeEnabled();
    await search(page, "smith");
    await expect(page).toHaveURL(/f\.region\.any_of=gauteng/);
    await expect(page).toHaveURL(/q=smith/);
    await openGrid(page, "/orders?f.created_at.in_period=last-7-days");
    await expect(bar(page).locator("[data-filter=search]")).toBeDisabled();
    await expect(bar(page).locator("[data-field=search]")).toHaveAttribute(
      "title",
      /equality filters only/,
    );
  });
});

test.describe("the narrowed-set tier", () => {
  const field = (page: Page, name: string) =>
    bar(page).locator(`[data-field="${name}"]`);

  test("on the whole table the expensive controls are held with the size, and narrowing frees them", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    for (const name of ["total", "note"]) {
      await expect(field(page, name)).toHaveAttribute(
        "title",
        /^Narrow by Status or Region first: 620.000 rows\.$/,
      );
      await expect(field(page, name)).toHaveAttribute("data-unavailable", "");
    }
    await expect(field(page, "created_at")).not.toHaveAttribute(
      "data-unavailable",
      "",
    );
    await expect(field(page, "customer_name")).not.toHaveAttribute(
      "data-unavailable",
      "",
    );
    await bar(page).locator('[data-filter="customer_name.op"]').click();
    await expect(option(page, "not_contains")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(option(page, "not_contains")).toHaveAttribute(
      "title",
      /^Narrow by Status or Region first: 620.000 rows\.$/,
    );
    await page.keyboard.press("Escape");

    await pick(page, "status_code", "failed");
    await expect(field(page, "total")).not.toHaveAttribute(
      "data-unavailable",
      "",
    );
    const note = bar(page).locator('[data-filter="note.value"]');
    await expect(note).toBeEnabled();
    await note.fill("gift");
    await note.press("Enter");
    await expect(page).toHaveURL(/f\.note\.contains=gift/);
    await expect(chip(page, "filter:note:contains")).toHaveText(
      "Note contains “gift”",
    );
    const matches = await apiCount(
      page,
      "f.status_code.any_of=failed&f.note.contains=gift",
    );
    expect(matches).toBeGreaterThan(0);
    await expectCount(page, matches, "capped");
    for (const text of await cells(page, "note")) {
      expect(text.toLowerCase()).toContain("gift");
    }

    await chooseOp(page, "total", "greater_or_equal");
    const value = bar(page).locator('[data-filter="total.value"]');
    await value.fill("200");
    await value.press("Enter");
    await expect(page).toHaveURL(/f\.total\.greater_or_equal=20000/);
    await expectCount(
      page,
      await apiCount(
        page,
        "f.status_code.any_of=failed&f.note.contains=gift&f.total.greater_or_equal=20000",
      ),
      "capped",
    );
    await expect(page.locator("[data-chip]")).toHaveCount(4);

    await page.locator('[data-chip-remove="filter:note:contains"]').click();
    await expect(page).not.toHaveURL(/f\.note/);
    await expect(note).toHaveValue("");
  });

  test("match any unions two filters when their rows fit the limit, and is held when they do not", async ({
    page,
  }) => {
    const pair = "f.status_code.any_of=failed&f.channel.any_of=phone";
    await openGrid(page, `/orders?${pair}`);
    const both = await apiCount(page, pair);
    const any = bar(page).locator('[data-combine="or"]');
    await expect(any).toBeEnabled();
    await any.click();
    await expect(page).toHaveURL(/match=any/);
    await expect(chip(page, "combine")).toHaveText(/Match any/);
    const either = await apiCount(page, `${pair}&match=any`);
    expect(either).toBeGreaterThan(both);
    await expectCount(page, either, "capped");
    const rows = await page.request.get(
      `/api/orders?${pair}&match=any&limit=1000`,
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

    await bar(page).locator('[data-combine="and"]').click();
    await expect(page).not.toHaveURL(/match=any/);
    await expectCount(page, both, "capped");

    await openGrid(
      page,
      "/orders?f.status_code.any_of=completed&f.region.any_of=gauteng",
    );
    await expect(bar(page).locator('[data-combine="or"]')).toBeDisabled();
    await expect(field(page, "combine")).toHaveAttribute(
      "title",
      /^Narrow the filters first: .* rows\.$/,
    );
  });

  test("a URL over the limit is refused by the server and says how to get under it", async ({
    page,
  }) => {
    await page.goto("/orders?f.note.contains=gift");
    await expect(page.locator("[data-feed-state=error]")).toContainText(
      /more than 100.000 rows/,
    );
    const refused = await page.request.get("/api/orders?f.note.contains=gift");
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
    ).toHaveText(/Narrow by Status or Region first/);
    await expect(
      sidebar.locator('[data-field="customer_name"] [data-field-reason]'),
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
      "/api/orders/narrowed?f.status_code.any_of=failed&f.channel.any_of=phone",
    );
    const body = (await sizes.json()) as {
      limit: number;
      and: { rows: number; over: boolean };
      or: { rows: number; over: boolean };
    };
    expect(body.limit).toBe(100000);
    expect(body.and.over).toBe(false);
    expect(body.or.rows).toBeGreaterThan(body.and.rows);
  });

  test("the in-memory grid takes contains and match any with no limit", async ({
    page,
  }) => {
    await openGrid(page, "/memory");
    await expect(field(page, "title")).not.toHaveAttribute(
      "data-unavailable",
      "",
    );
    const input = bar(page).locator('[data-filter="title.value"]');
    await input.fill("fix");
    await input.press("Enter");
    await expect(page).toHaveURL(/f\.title\.contains=fix/);
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
    await bar(page).locator('[data-combine="or"]').click();
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
  test("the operator select and the chips render under dir=rtl", async ({
    page,
  }) => {
    await openGrid(
      page,
      "/rtl?f.status_code.none_of=cancelled&f.created_at.in_period=last-7-days",
    );
    await expect(chip(page, "filter:status_code:none_of")).toContainText(
      "Status none of:",
    );
    await expect(chip(page, "filter:created_at:in_period")).toHaveText(
      "Created in period Last 7 days",
    );
    const opSelect = bar(page).locator('[data-filter="status_code.op"]');
    await expect(opSelect).toContainText("none of");
    const [opBox, valueBox] = await Promise.all([
      opSelect.boundingBox(),
      bar(page).locator('[data-filter="status_code"]').boundingBox(),
    ]);
    expect(opBox!.x).toBeGreaterThan(valueBox!.x);
    await openGrid(page, "/rtl?f.assignee.blank=");
    await expect(chip(page, "filter:assignee:blank")).toHaveText(
      "Assignee blank",
    );
  });
});
