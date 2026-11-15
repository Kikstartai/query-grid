import {
  apiCount,
  countValue,
  expect,
  expectCount,
  openGrid,
  pick,
  test,
  texts,
  total,
  urlPath,
} from "./fixtures";

test("default and Paid counts come from the counter table", async ({
  page,
}) => {
  await openGrid(page, "/orders");
  await expectCount(page, 620000);
  const facets = await texts(page.locator("[data-facet]"));
  expect(facets[0]).toMatch(/^All620\s000$/);
  expect(facets).toHaveLength(8);
  const paid = await apiCount(page, "f.status_code=paid");
  await pick(page, "status_code", "paid");
  await expectCount(page, paid);
  expect(await urlPath(page)).toBe("/orders?f.status_code=paid");
  await expect(total(page)).toHaveAttribute("data-total", "counter");
  await expect(total(page)).toContainText("Total sum");
  await expect(total(page)).toContainText("Items sum");
  await expect(total(page)).toContainText("from the counter table");
});

test("facet counts hide once another filter is active", async ({ page }) => {
  await openGrid(page, "/orders?f.region=gauteng");
  await expect(page.locator("[data-facet]").first()).toBeVisible();
  await expect(page.locator("[data-facet-count]").first()).toBeEmpty();
  for (const count of await texts(page.locator("[data-facet-count]"))) {
    expect(count).toBe("");
  }
  await expect(page.locator(".qg-facet-note")).not.toBeEmpty();
});

test("capped count, then exact", async ({ page }) => {
  await openGrid(
    page,
    "/orders?f.status_code=paid&r.total=20000..60000&sort=total.desc",
  );
  await expectCount(page, 10000, "capped");
  await expect(countValue(page)).toHaveText(/^10\s000\+ rows$/);
  await expect(total(page)).toHaveAttribute("data-total", "unavailable");
  await expect(total(page)).toContainText(
    "More than 10 000 rows match and no counter totals this filter.",
  );
  await page.locator("[data-count-exact]").click();
  await expect(countValue(page)).toHaveAttribute("data-count-source", "exact");
  expect(
    Number(await countValue(page).getAttribute("data-count")),
  ).toBeGreaterThan(10000);
  await expect(countValue(page)).not.toContainText("+");
});

test("Paid in a week is summed live", async ({ page }) => {
  await openGrid(
    page,
    "/orders?f.status_code=paid&r.created_at=2026-11-01T00:00:00.000000Z..2026-11-07T23:59:59.999999Z",
  );
  const rows = await countValue(page).getAttribute("data-count");
  expect(Number(rows)).toBeGreaterThan(0);
  expect(Number(rows)).toBeLessThan(10000);
  await expect(total(page)).toHaveAttribute("data-total", "live");
  await expect(total(page)).toContainText("summed live over");
  await expect(
    total(page).locator("[data-total-field=total] [data-total-sum]"),
  ).toHaveText(/^R\s[\d\s]+,\d\d$/);
});
