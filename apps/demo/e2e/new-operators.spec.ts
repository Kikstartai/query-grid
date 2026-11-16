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
  test,
  texts,
} from "./fixtures";

function chip(page: Page, id: string) {
  return page.locator(`[data-chip="${id}"]`);
}

function textRow(page: Page, at: number) {
  return bar(page).locator(`[data-text-row="${at}"]`);
}

async function cells(page: Page, field: string): Promise<string[]> {
  return texts(page.locator(`.qg-cell[data-field=${field}]`));
}

async function count(page: Page): Promise<number> {
  return Number(await countValue(page).getAttribute("data-count"));
}

async function choose(page: Page, filter: string, option: string) {
  await bar(page).locator(`[data-filter="${filter}"]`).click();
  await page.locator(`[data-option="${option}"]`).click();
}

async function fillText(page: Page, at: number, text: string) {
  const input = textRow(page, at).locator('[data-filter="text"]');
  await input.fill(text);
  await input.press("Enter");
}

async function setOperator(page: Page, at: number, op: string) {
  await textRow(page, at).locator('[data-filter="text.op"]').click();
  await page.locator(`[data-option="${op}"]`).click();
}

test.describe("a text filter with an index of its own", () => {
  test("pages the whole table in order, and asks for three characters", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    await fillText(page, 0, "mo");
    await expect(textRow(page, 0).locator("[data-text-hint]")).toHaveText(
      "3 characters or more",
    );
    await expect(page).not.toHaveURL(/c\.customer_name/);

    await fillText(page, 0, "mokoena");
    await expect(page).toHaveURL(/c\.customer_name=mokoena/);
    await expect(chip(page, "text:0")).toHaveText(
      /Customer contains “mokoena”/,
    );
    await expect(page.locator("[data-feed-state=error]")).toHaveCount(0);
    await expect(loaded(page)).toBeVisible();
    const names = await cells(page, "customer_name");
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name.toLowerCase()).toContain("mokoena");
    }
    await expectCount(
      page,
      await apiCount(page, "c.customer_name=mokoena"),
      "capped",
    );
  });

  test("takes starts with and ends with, and holds the negations to the narrowed set", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    await textRow(page, 0).locator('[data-filter="text.op"]').click();
    await expect(page.locator('[data-option="not_contains"]')).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(page.locator('[data-option="not_equals"]')).toHaveAttribute(
      "title",
      /Narrow by Status or Customer account first/,
    );
    await page.locator('[data-option="starts_with"]').click();
    await fillText(page, 0, "Zan");
    await expect(page).toHaveURL(/sw\.customer_name=Zan/);
    await expect(chip(page, "text:0")).toHaveText(/Customer starts with “Zan”/);
    for (const name of await cells(page, "customer_name")) {
      expect(name.toLowerCase().startsWith("zan")).toBe(true);
    }

    await setOperator(page, 0, "ends_with");
    await expect(page).toHaveURL(/ew\.customer_name=Zan/);
    await fillText(page, 0, "ena");
    await expect(page).toHaveURL(/ew\.customer_name=ena/);
    await expect(loaded(page)).toBeVisible();
    for (const name of await cells(page, "customer_name")) {
      expect(name.toLowerCase().endsWith("ena")).toBe(true);
    }
  });

  test("a second filter on the same field narrows it further once the set is small", async ({
    page,
  }) => {
    await openGrid(
      page,
      "/orders?f.status_code=failed&c.customer_name=mokoena",
    );
    const first = await apiCount(
      page,
      "f.status_code=failed&c.customer_name=mokoena",
    );
    await expectCount(page, first, "capped");
    await expect(textRow(page, 1)).toBeVisible();
    await setOperator(page, 1, "not_contains");
    await fillText(page, 1, "th");
    await expect(page).toHaveURL(/nc\.customer_name=th/);
    await expect(chip(page, "text:1")).toHaveText(
      /Customer does not contain “th”/,
    );
    const both = await apiCount(
      page,
      "f.status_code=failed&c.customer_name=mokoena&nc.customer_name=th",
    );
    expect(both).toBeLessThan(first);
    await expectCount(page, both, "capped");
    for (const name of await cells(page, "customer_name")) {
      expect(name.toLowerCase()).toContain("mokoena");
      expect(name.toLowerCase()).not.toContain("th");
    }
    await page.locator('[data-chip-remove="text:0"]').click();
    await expect(page).not.toHaveURL(/[?&]c\.customer_name/);
    await expect(page).toHaveURL(/nc\.customer_name=th/);
  });
});

test.describe("a range and its operator, on the server", () => {
  test("more than leaves the bound out, and not between is everything outside", async ({
    page,
  }) => {
    await openGrid(page, "/orders?f.status_code=failed");
    await choose(page, "total.op", "gt");
    const value = bar(page).locator('[data-filter="total.value"]');
    await value.fill("200");
    await value.press("Enter");
    await expect(page).toHaveURL(/r\.total=(\(|%28)20000\.\./);
    await expect(chip(page, "range:total")).toHaveText(/Total > /);
    const over = await apiCount(page, "f.status_code=failed&r.total=(20000..");
    const from = await apiCount(page, "f.status_code=failed&r.total=20000..");
    expect(over).toBeLessThanOrEqual(from);
    await expectCount(page, over, "capped");

    await choose(page, "total.op", "not_between");
    const min = bar(page).locator('[data-filter="total.min"]');
    const max = bar(page).locator('[data-filter="total.max"]');
    await min.fill("100");
    await min.press("Enter");
    await max.fill("900");
    await max.press("Enter");
    await expect(page).toHaveURL(/r\.total=(!|%21)10000\.\.90000/);
    await expect(chip(page, "range:total")).toHaveText(/Total: not /);
    const outside = await apiCount(
      page,
      "f.status_code=failed&r.total=!10000..90000",
    );
    const inside = await apiCount(
      page,
      "f.status_code=failed&r.total=10000..90000",
    );
    const all = await apiCount(page, "f.status_code=failed");
    expect(outside + inside).toBe(all);
    await expectCount(page, outside, "capped");
  });

  test("a date takes On… with one day, and the index answers its range on the sort", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    await choose(page, "created_at.preset", "op:eq");
    const day = bar(page).locator('[data-filter="created_at.value"]');
    await expect(day).toBeVisible();
    await page.goto(
      "/orders?r.created_at=2026-01-10T00:00:00.000000Z..2026-01-10T23:59:59.999999Z",
    );
    await expect(loaded(page)).toBeVisible();
    await expect(chip(page, "range:created_at")).toHaveText(
      "Created = 2026-01-10",
    );
    await expect(
      bar(page).locator('[data-filter="created_at.preset"]'),
    ).toContainText("On…");
    await expectCount(
      page,
      await apiCount(
        page,
        "r.created_at=2026-01-10T00:00:00.000000Z..2026-01-10T23:59:59.999999Z",
      ),
      "capped",
    );
  });
});

test.describe("the new field types, in memory", () => {
  test("a boolean, an array, a date and a decimal each filter the rows", async ({
    page,
  }) => {
    await openGrid(page, "/memory");
    const all = await count(page);

    await pick(page, "blocked", "true");
    await expect(chip(page, "eq:blocked")).toContainText("Yes");
    const blocked = await count(page);
    expect(blocked).toBeGreaterThan(0);
    expect(blocked).toBeLessThan(all);
    for (const cell of await cells(page, "blocked")) {
      expect(cell).toBe("Yes");
    }

    await bar(page).locator('[data-filter="labels"]').click();
    await page.locator('[data-option="bug"]').click();
    await expect(page).toHaveURL(/o\.labels=bug/);
    await page.locator('[data-option="urgent"]').click();
    await expect(page).toHaveURL(/o\.labels=urgent/);
    await page.keyboard.press("Escape");
    await expect(chip(page, "overlap:labels")).toContainText("Labels has:");
    await expect
      .poll(async () => {
        const labels = await cells(page, "labels");
        return (
          labels.length > 0 && labels.every((label) => /Bug|Urgent/.test(label))
        );
      })
      .toBe(true);
    expect(await count(page)).toBeLessThan(blocked);

    for (const value of ["bug", "urgent"]) {
      await page
        .locator(
          `[data-chip-remove="overlap:labels"][data-chip-value="${value}"]`,
        )
        .click();
    }
    await page.locator('[data-chip-remove="eq:blocked"]').first().click();
    await expect(countValue(page)).toHaveAttribute("data-count", String(all));

    await choose(page, "rate.op", "lt");
    const rate = bar(page).locator('[data-filter="rate.value"]');
    await rate.fill("50.5");
    await rate.press("Enter");
    await expect(page).toHaveURL(/r\.rate=\.\.50\.5(\)|%29)/);
    await expect(chip(page, "range:rate")).toHaveText("Rate < 50.5");
    await expect
      .poll(async () => {
        const rates = await cells(page, "rate");
        return rates.length > 0 && rates.every((item) => Number(item) < 50.5);
      })
      .toBe(true);
  });

  test("a date field reads a day from the URL as On…, and an excluded day as Not on…", async ({
    page,
  }) => {
    await openGrid(page, "/memory?r.start_on=2026-11-20..2026-11-20");
    await expect(chip(page, "range:start_on")).toHaveText("Start = 2026-11-20");
    await expect(
      bar(page).locator('[data-filter="start_on.preset"]'),
    ).toContainText("On…");
    const on = await count(page);
    for (const start of await cells(page, "start_on")) {
      expect(start).toBe("Nov 20, 2026");
    }
    await openGrid(page, "/memory?r.start_on=!2026-11-20..2026-11-20");
    await expect(chip(page, "range:start_on")).toHaveText("Start ≠ 2026-11-20");
    await expect(
      bar(page).locator('[data-filter="start_on.preset"]'),
    ).toContainText("Not on…");
    const off = await count(page);
    await openGrid(page, "/memory");
    expect(on + off).toBe(await count(page));
  });

  test("two text filters on one field, each with its own operator and chip", async ({
    page,
  }) => {
    await openGrid(page, "/memory");
    await setOperator(page, 0, "starts_with");
    await fillText(page, 0, "fix");
    await expect(page).toHaveURL(/sw\.title=fix/);
    await setOperator(page, 1, "not_contains");
    await fillText(page, 1, "login");
    await expect(page).toHaveURL(/nc\.title=login/);
    await expect(chip(page, "text:0")).toHaveText(
      /Title (starts with “fix”|does not contain “login”)/,
    );
    await expect(page.locator('[data-chip^="text:"]')).toHaveCount(2);
    await expect
      .poll(async () => {
        const titles = await cells(page, "title");
        return (
          titles.length > 0 &&
          titles.every(
            (title) =>
              title.toLowerCase().startsWith("fix") &&
              !title.toLowerCase().includes("login"),
          )
        );
      })
      .toBe(true);
    await expect(textRow(page, 2)).toBeVisible();
  });
});
