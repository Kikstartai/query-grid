import type { Page } from "@playwright/test";

import {
  apiCount,
  attrs,
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

function option(page: Page, value: string) {
  return page.locator(`[data-option="${value}"]:visible`);
}

async function cells(page: Page, field: string): Promise<string[]> {
  return texts(page.locator(`.qg-cell[data-field=${field}]`));
}

async function count(page: Page): Promise<number> {
  return Number(await countValue(page).getAttribute("data-count"));
}

async function chooseOp(page: Page, field: string, op: string) {
  await bar(page).locator(`[data-filter="${field}.op"]`).click();
  await option(page, op).click();
}

async function fillValue(page: Page, field: string, text: string) {
  const input = bar(page).locator(`[data-filter="${field}.value"]`);
  await input.fill(text);
  await input.press("Enter");
}

test.describe("a text filter with an index of its own", () => {
  test("contains pages the whole table in order, and asks for three characters", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    const name = bar(page).locator('[data-field="customer_name"]');
    await expect(name).toHaveAttribute("data-kind", "text");
    await expect(
      bar(page).locator('[data-filter="customer_name.op"]'),
    ).toContainText("contains");
    await fillValue(page, "customer_name", "mo");
    await expect(name.locator("[data-text-hint]")).toHaveText(
      "3 characters or more",
    );
    await expect(page).not.toHaveURL(/f\.customer_name/);

    await fillValue(page, "customer_name", "mokoena");
    await expect(name.locator("[data-text-hint]")).toHaveCount(0);
    await expect(page).toHaveURL(/f\.customer_name\.contains=mokoena/);
    await expect(chip(page, "filter:customer_name:contains")).toHaveText(
      "Customer contains “mokoena”",
    );
    await expect(page.locator("[data-feed-state=error]")).toHaveCount(0);
    await expect(loaded(page)).toBeVisible();
    const names = await cells(page, "customer_name");
    expect(names.length).toBeGreaterThan(0);
    for (const shown of names) {
      expect(shown.toLowerCase()).toContain("mokoena");
    }
    await expectCount(
      page,
      await apiCount(page, "f.customer_name.contains=mokoena"),
      "capped",
    );
  });

  test("takes starts with and ends with, and holds equals and the negations to the narrowed set", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    await bar(page).locator('[data-filter="customer_name.op"]').click();
    for (const held of ["equals", "not_equals", "not_contains"]) {
      await expect(option(page, held)).toHaveAttribute("aria-disabled", "true");
      await expect(option(page, held)).toHaveAttribute(
        "title",
        /Narrow by Status or Region first/,
      );
    }
    await option(page, "starts_with").click();
    await fillValue(page, "customer_name", "Zan");
    await expect(page).toHaveURL(/f\.customer_name\.starts_with=Zan/);
    await expect(chip(page, "filter:customer_name:starts_with")).toHaveText(
      "Customer starts with “Zan”",
    );
    await expect(loaded(page)).toBeVisible();
    for (const shown of await cells(page, "customer_name")) {
      expect(shown.toLowerCase().startsWith("zan")).toBe(true);
    }

    await chooseOp(page, "customer_name", "ends_with");
    await expect(page).toHaveURL(/f\.customer_name\.ends_with=Zan/);
    await fillValue(page, "customer_name", "ena");
    await expect(page).toHaveURL(/f\.customer_name\.ends_with=ena/);
    await expect(loaded(page)).toBeVisible();
    for (const shown of await cells(page, "customer_name")) {
      expect(shown.toLowerCase().endsWith("ena")).toBe(true);
    }
  });

  test("equals matches the whole value once a filter narrows the set", async ({
    page,
  }) => {
    const response = await page.request.get(
      "/api/orders?f.status_code.any_of=failed&limit=1",
    );
    const { rows } = (await response.json()) as {
      rows: { customer_name: string }[];
    };
    const [{ customer_name: name }] = rows;
    await openGrid(page, "/orders?f.status_code.any_of=failed");
    await chooseOp(page, "customer_name", "equals");
    await fillValue(page, "customer_name", name);
    await expect(page).toHaveURL(
      new RegExp(`f\\.customer_name\\.equals=${name.replace(" ", "\\+")}`),
    );
    await expect(chip(page, "filter:customer_name:equals")).toHaveText(
      `Customer equals “${name}”`,
    );
    await expect
      .poll(async () => [...new Set(await cells(page, "customer_name"))])
      .toEqual([name]);
  });

  test("a second filter on the same field, from the URL, narrows it further", async ({
    page,
  }) => {
    const first =
      "f.status_code.any_of=failed&f.customer_name.contains=mokoena";
    const second = `${first}&f.customer_name.not_contains=th`;
    await openGrid(page, `/orders?${second}`);
    await expect(chip(page, "filter:customer_name:contains")).toHaveText(
      "Customer contains “mokoena”",
    );
    await expect(chip(page, "filter:customer_name:not_contains:1")).toHaveText(
      "Customer not contains “th”",
    );
    const one = await apiCount(page, first);
    const both = await apiCount(page, second);
    expect(both).toBeLessThan(one);
    await expectCount(page, both, "capped");
    for (const name of await cells(page, "customer_name")) {
      expect(name.toLowerCase()).toContain("mokoena");
      expect(name.toLowerCase()).not.toContain("th");
    }
    await page
      .locator('[data-chip-remove="filter:customer_name:contains"]')
      .click();
    await expect(page).not.toHaveURL(/customer_name\.contains/);
    await expect(page).toHaveURL(/f\.customer_name\.not_contains=th/);
  });
});

test.describe("comparisons and ranges, on the server", () => {
  test("greater than leaves the bound out, and not between is everything outside", async ({
    page,
  }) => {
    const failed = "f.status_code.any_of=failed";
    await openGrid(page, `/orders?${failed}`);
    await expect(bar(page).locator('[data-filter="total.op"]')).toContainText(
      "between",
    );
    await chooseOp(page, "total", "greater_than");
    await fillValue(page, "total", "200");
    await expect(page).toHaveURL(/f\.total\.greater_than=20000/);
    await expect(chip(page, "filter:total:greater_than")).toHaveText(
      /^Total greater than R\s200,00$/,
    );
    const over = await apiCount(page, `${failed}&f.total.greater_than=20000`);
    const from = await apiCount(
      page,
      `${failed}&f.total.greater_or_equal=20000`,
    );
    expect(over).toBeLessThanOrEqual(from);
    await expectCount(page, over, "capped");

    await chooseOp(page, "total", "not_between");
    const min = bar(page).locator('[data-filter="total.min"]');
    const max = bar(page).locator('[data-filter="total.max"]');
    await min.fill("100");
    await min.press("Enter");
    await max.fill("900");
    await max.press("Enter");
    await expect(page).toHaveURL(/f\.total\.not_between=10000\.\.90000/);
    await expect(chip(page, "filter:total:not_between")).toHaveText(
      /^Total not between R\s100,00 and R\s900,00$/,
    );
    const outside = await apiCount(
      page,
      `${failed}&f.total.not_between=10000..90000`,
    );
    const inside = await apiCount(
      page,
      `${failed}&f.total.between=10000..90000`,
    );
    expect(outside + inside).toBe(await apiCount(page, failed));
    await expectCount(page, outside, "capped");
  });

  test("a date takes on with one day, and the index answers it on the sort", async ({
    page,
  }) => {
    await openGrid(page, "/orders");
    await chooseOp(page, "created_at", "equals");
    await expect(
      bar(page).locator('[data-filter="created_at.value"]'),
    ).toBeVisible();
    await expect(
      bar(page).locator('[data-filter="created_at.preset"]'),
    ).toHaveCount(0);
    await openGrid(page, "/orders?f.created_at.equals=2026-01-10");
    await expect(chip(page, "filter:created_at:equals")).toHaveText(
      "Created on 2026-01-10",
    );
    await expect(
      bar(page).locator('[data-filter="created_at.op"]'),
    ).toContainText("on");
    await expectCount(
      page,
      await apiCount(page, "f.created_at.equals=2026-01-10"),
      "capped",
    );
  });
});

test.describe("the field kinds, in memory", () => {
  test("a boolean, an array, and a decimal each filter the rows", async ({
    page,
  }) => {
    await openGrid(page, "/memory");
    const all = await count(page);

    await pick(page, "blocked", "true");
    await expect(chip(page, "filter:blocked:any_of")).toContainText("Yes");
    const blocked = await count(page);
    expect(blocked).toBeGreaterThan(0);
    expect(blocked).toBeLessThan(all);
    for (const cell of await cells(page, "blocked")) {
      expect(cell).toBe("Yes");
    }

    await expect(bar(page).locator('[data-field="labels"]')).toHaveAttribute(
      "data-kind",
      "array",
    );
    await bar(page).locator('[data-filter="labels"]').click();
    await option(page, "bug").click();
    await expect(page).toHaveURL(/f\.labels\.any_of=bug/);
    await option(page, "urgent").click();
    await expect(page).toHaveURL(/f\.labels\.any_of=urgent/);
    await page.keyboard.press("Escape");
    await expect(chip(page, "filter:labels:any_of")).toContainText(
      "Labels any of:",
    );
    await expect
      .poll(async () => {
        const labels = await attrs(
          page.locator(".qg-cell[data-field=labels] .qg-list-cell"),
          "title",
        );
        return (
          labels.length > 0 && labels.every((label) => /Bug|Urgent/.test(label))
        );
      })
      .toBe(true);
    const either = await count(page);
    expect(either).toBeLessThan(blocked);

    await chooseOp(page, "labels", "all_of");
    await expect(page).toHaveURL(
      /f\.labels\.all_of=bug&f\.labels\.all_of=urgent/,
    );
    await expect
      .poll(async () => {
        const labels = await attrs(
          page.locator(".qg-cell[data-field=labels] .qg-list-cell"),
          "title",
        );
        return (
          labels.length > 0 &&
          labels.every(
            (label) => label.includes("Bug") && label.includes("Urgent"),
          )
        );
      })
      .toBe(true);
    expect(await count(page)).toBeLessThanOrEqual(either);

    for (const value of ["bug", "urgent"]) {
      await page
        .locator(
          `[data-chip-remove="filter:labels:all_of"][data-chip-value="${value}"]`,
        )
        .click();
    }
    await page
      .locator('[data-chip-remove="filter:blocked:any_of"]')
      .first()
      .click();
    await expect(countValue(page)).toHaveAttribute("data-count", String(all));

    await chooseOp(page, "labels", "blank");
    await expect(page).toHaveURL(/f\.labels\.blank=/);
    await expect(chip(page, "filter:labels:blank")).toHaveText("Labels blank");
    await expect
      .poll(async () => [...new Set(await cells(page, "labels"))])
      .toEqual([""]);
    await page.locator('[data-chip-remove="filter:labels:blank"]').click();

    await chooseOp(page, "rate", "less_than");
    await fillValue(page, "rate", "50.5");
    await expect(page).toHaveURL(/f\.rate\.less_than=50\.5/);
    await expect(chip(page, "filter:rate:less_than")).toHaveText(
      "Rate less than 50.5",
    );
    await expect
      .poll(async () => {
        const rates = await cells(page, "rate");
        return rates.length > 0 && rates.every((item) => Number(item) < 50.5);
      })
      .toBe(true);
  });

  test("a date field reads on, not on, blank and not blank from the URL", async ({
    page,
  }) => {
    await openGrid(page, "/memory");
    const all = await count(page);
    await openGrid(page, "/memory?f.start_on.equals=2026-11-20");
    await expect(chip(page, "filter:start_on:equals")).toHaveText(
      "Start on 2026-11-20",
    );
    await expect(
      bar(page).locator('[data-filter="start_on.op"]'),
    ).toContainText("on");
    await expect(
      bar(page).locator('[data-filter="start_on.value"]'),
    ).toBeVisible();
    const on = await count(page);
    expect(on).toBeGreaterThan(0);
    for (const start of await cells(page, "start_on")) {
      expect(start).toBe("Nov 20, 2026");
    }
    await openGrid(page, "/memory?f.start_on.not_equals=2026-11-20");
    await expect(chip(page, "filter:start_on:not_equals")).toHaveText(
      "Start not on 2026-11-20",
    );
    await expect(
      bar(page).locator('[data-filter="start_on.op"]'),
    ).toContainText("not on");
    expect(on + (await count(page))).toBe(all);

    await openGrid(page, "/memory?f.start_on.blank=");
    await expect(chip(page, "filter:start_on:blank")).toHaveText("Start blank");
    const blank = await count(page);
    expect(blank).toBeGreaterThan(0);
    await openGrid(page, "/memory?f.start_on.not_blank=");
    expect(blank + (await count(page))).toBe(all);
  });

  test("two text filters on one field, each with its own operator and chip", async ({
    page,
  }) => {
    await openGrid(page, "/memory?f.title.starts_with=fix");
    await expect(chip(page, "filter:title:starts_with")).toHaveText(
      "Title starts with “fix”",
    );
    await expect(bar(page).locator('[data-filter="title.op"]')).toContainText(
      "starts with",
    );
    await expect(bar(page).locator('[data-filter="title.value"]')).toHaveValue(
      "fix",
    );
    await openGrid(
      page,
      "/memory?f.title.starts_with=fix&f.title.not_contains=login",
    );
    await expect(
      page.locator('[data-chip^="filter:title:not_contains"]'),
    ).toHaveText("Title not contains “login”");
    await expect(page.locator('[data-chip^="filter:title:"]')).toHaveCount(2);
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
  });
});
