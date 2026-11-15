import {
  apiCount,
  attrs,
  bar,
  countValue,
  expect,
  expectCount,
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

test("filter sidebar", async ({ page }) => {
  await openGrid(page, "/orders?f.status_code=paid&sort=total.desc");
  await page.locator("[data-part=filter-sidebar-trigger]").click();
  const sidebar = page.locator("[data-part=filter-sidebar]");
  await expect(sidebar.locator("[data-field]")).toHaveCount(17);
  const disabled = sidebar.locator("[data-unavailable]");
  await expect(disabled).toHaveCount(4);
  for (const reason of await texts(disabled.locator("[data-field-reason]"))) {
    expect(reason).not.toBe("");
  }
  await expect(disabled.locator("[data-field-reason]")).toHaveCount(4);
  await sidebar.locator("[data-sort=direction]").click();
  await expect(page).toHaveURL(/sort=total\.asc/);
  await expect(
    page.locator("[data-chip]").filter({ hasText: "Total" }),
  ).toContainText("↑");
  await sidebar.locator("[data-filter-clear=status_code]").click();
  await expect(page).not.toHaveURL(/f\.status_code/);
  await expectCount(page, 620000);
  await page.locator("[data-sidebar-close]").click();
  await expect(sidebar).toBeHidden();
});

test("chips and Reset", async ({ page }) => {
  await openGrid(page, "/orders");
  await pick(page, "status_code", "shipped");
  await pick(page, "region", "gauteng");
  await expect(page.locator("[data-chip]")).toHaveCount(3);
  await expect(countValue(page)).toHaveAttribute("data-count-source", /.+/);
  await page.locator('[data-chip-remove="eq:region"]').click();
  await expect(page.locator("[data-chip]")).toHaveCount(2);
  await expectCount(page, await apiCount(page, "f.status_code=shipped"));
  await page.locator("[data-chips-reset]").click();
  await expect(page.locator("[data-chip]")).toHaveCount(1);
  expect(await urlPath(page)).toBe("/orders");
  await expect(page.locator("[data-chips-reset]")).toBeDisabled();
  await expectCount(page, 620000);
});

test("several values per field", async ({ page }) => {
  await openGrid(page, "/orders");
  const [paid, shipped, refunded, failed] = await Promise.all(
    ["paid", "shipped", "refunded", "failed"].map((status) =>
      apiCount(page, `f.status_code=${status}`),
    ),
  );
  await pick(page, "status_code", "paid", "shipped");
  expect(await urlPath(page)).toBe(
    "/orders?f.status_code=paid&f.status_code=shipped",
  );
  await expect(bar(page).locator("[data-filter=status_code]")).toContainText(
    "Paid",
  );
  const chip = page.locator('[data-chip="eq:status_code"]');
  await expect(chip.locator(".qg-chip-value")).toHaveCount(2);
  await expect
    .poll(() => attrs(chip.locator("[data-chip-remove]"), "data-chip-value"))
    .toEqual(["paid", "shipped"]);
  await expectCount(page, paid + shipped);
  await expect(total(page)).toHaveAttribute("data-total", "counter");
  await expect
    .poll(() =>
      attrs(page.locator('[data-facet][aria-pressed="true"]'), "data-facet"),
    )
    .toEqual(["shipped", "paid"]);
  await expect
    .poll(async () =>
      [
        ...new Set(
          await attrs(
            page.locator(".qg-cell[data-field=status_code] [data-value]"),
            "data-value",
          ),
        ),
      ].sort(),
    )
    .toEqual(["paid", "shipped"]);

  await page
    .locator('[data-chip-remove="eq:status_code"][data-chip-value="paid"]')
    .click();
  expect(await urlPath(page)).toBe("/orders?f.status_code=shipped");
  await expectCount(page, shipped);
  await page.locator('[data-facet="refunded"]').click();
  await expect(page).toHaveURL(/refunded/);
  await page.locator('[data-facet="failed"]').click();
  await expect(page).toHaveURL(/failed/);
  await expectCount(page, shipped + refunded + failed);
  await page.locator('[data-facet=""]').click();
  await expect(page).not.toHaveURL(/f\.status_code/);
  await expectCount(page, 620000);
});

test("several values restore from the URL and narrow the board", async ({
  page,
}) => {
  await openGrid(
    page,
    "/orders?f.region=gauteng&f.region=limpopo&f.status_code=paid",
  );
  await expect(
    page.locator('[data-chip="eq:region"] .qg-chip-value'),
  ).toHaveCount(2);
  await expectCount(
    page,
    await apiCount(
      page,
      "f.region=gauteng&f.region=limpopo&f.status_code=paid",
    ),
    "capped",
  );
  const regions = new Set(
    await texts(page.locator(".qg-cell[data-field=region]")),
  );
  expect([...regions].sort()).toEqual(["Gauteng", "Limpopo"]);
  await open(
    page,
    "/orders?view=board&f.status_code=paid&f.status_code=shipped",
  );
  await expect(page.locator("[data-column] [data-card]").first()).toBeVisible();
  await expect
    .poll(() => attrs(page.locator("[data-column]"), "data-column"))
    .toEqual(["shipped", "paid"]);
});

test("URL history", async ({ page }) => {
  await open(page, "/");
  await openGrid(page, "/orders");
  const start = await page.evaluate(() => history.length);
  await pick(page, "status_code", "paid");
  await pick(page, "region", "gauteng");
  await page.locator('[data-header-sort="created_at"]').click();
  await expect(page).toHaveURL(/sort=created_at\.asc/);
  await page.locator("[data-view=list]").click();
  await expect(page).toHaveURL(/view=list/);
  expect(await page.evaluate(() => history.length)).toBe(start + 4);

  await page.goBack();
  await expect(page).not.toHaveURL(/view=list/);
  await expect(page.locator("[data-part=list]")).toHaveCount(0);
  await page.goBack();
  await expect(page).not.toHaveURL(/sort=/);
  await page.goBack();
  await expect(page).not.toHaveURL(/f\.region/);
  await expect(page.locator("[data-chip]")).toHaveCount(2);
  await expectCount(page, await apiCount(page, "f.status_code=paid"));
  await page.goBack();
  expect(await urlPath(page)).toBe("/orders");
  await expectCount(page, 620000);
  await page.goForward();
  expect(await urlPath(page)).toBe("/orders?f.status_code=paid");
  await expect(page.locator('[data-chip="eq:status_code"]')).toBeVisible();

  await openGrid(page, "/orders");
  const before = await page.evaluate(() => history.length);
  await search(page, "zanele dlamini");
  await expect(page).toHaveURL(/q=zanele/);
  await search(page, "zanele dlam");
  await expect(page).toHaveURL(/q=zanele\+dlam$/);
  expect(await page.evaluate(() => history.length)).toBe(before);

  await open(page, "/");
  await page.locator('a[href="/orders?view=board"]').first().click();
  await expect(page).toHaveURL(/\/orders\?view=board$/);
  await expect(page.locator("[data-column]")).toHaveCount(7);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/orders\?view=board$/);
  await expect(page.locator("[data-column]")).toHaveCount(7);
});

test("search", async ({ page }) => {
  await openGrid(page, "/orders");
  await search(page, "zanele dlamini");
  await expect(loaded(page)).toHaveAttribute("data-value", "34");
  await expect(countValue(page)).toHaveAttribute("data-count", "34");
  await page.locator('[data-header-sort="total"]').click();
  await expect(page).toHaveURL(/sort=total\.desc/);
  await expect
    .poll(async () => {
      const totals = await page
        .locator(".qg-cell[data-field=total]")
        .evaluateAll((cells) =>
          cells
            .slice(0, 4)
            .map((cell) =>
              Number(
                cell.textContent?.replace(/[^\d,]/g, "").replace(",", "."),
              ),
            ),
        );
      return totals.join() === [...totals].sort((a, b) => b - a).join();
    })
    .toBe(true);

  await search(page, "123456");
  await expect(countValue(page)).toHaveAttribute("data-count", "1");
  await expect(page.locator(".qg-cell[data-field=order_number]")).toHaveText([
    "123456",
  ]);

  await search(page, "mok");
  await expect(countValue(page)).toHaveText(/^500\+ rows$/);
  await expect(bar(page).locator("[data-field=sort]")).toHaveAttribute(
    "title",
    /.+/,
  );

  await search(page, "ab");
  await expect(page.locator("[data-search-hint]")).not.toBeEmpty();

  await search(page, "---");
  await expect(page.locator("[data-feed-state=error]")).toBeVisible();
  await expect(page.locator("[data-part=count].qg-count-error")).toBeVisible();
  await expect(total(page)).toHaveAttribute("data-total", "unavailable");
});

test("customer picker", async ({ page }) => {
  await openGrid(page, "/orders");
  await bar(page).locator("[data-filter=customer_id]").click();
  await page.keyboard.type("mokoena");
  const items = page.locator("[data-slot=combobox-item]");
  await expect(items).toHaveCount(20);
  await items.first().click();
  await expect(page).toHaveURL(/f\.customer_id=/);
  await expect(items).toHaveCount(20);
  await page
    .locator('[data-slot=combobox-item]:not([aria-selected="true"])')
    .first()
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new URLSearchParams(location.search).getAll("f.customer_id").length,
      ),
    )
    .toBe(2);
  await page.keyboard.press("Escape");
  await expect(countValue(page)).toHaveAttribute("data-count", /\d+/);
  const chip = page.locator('[data-chip="eq:customer_id"]');
  await expect(chip.locator(".qg-chip-value")).toHaveCount(2);
  await page.reload();
  await expect(chip.locator(".qg-chip-value")).toHaveCount(2);
  await expect(bar(page).locator("[data-slot=combobox-chip]")).toHaveCount(2);
});
