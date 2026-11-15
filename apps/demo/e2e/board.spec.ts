import type { Page } from "@playwright/test";

import { center, dragTo, expect, open, test } from "./fixtures";

async function laneCounts(page: Page): Promise<Record<string, number>> {
  return page
    .locator("[data-column-count]")
    .evaluateAll((elements) =>
      Object.fromEntries(
        elements.map((element) => [
          (element as HTMLElement).dataset.columnCount,
          Number(element.textContent?.replace(/\D/g, "")),
        ]),
      ),
    );
}

const laneOf = (page: Page, card: string) =>
  page
    .locator(`[data-card="${card}"]`)
    .evaluate(
      (element) =>
        element.closest<HTMLElement>("[data-column]")?.dataset.column,
    );

async function firstCard(page: Page, lane: string): Promise<string> {
  const card = page.locator(`[data-column="${lane}"] [data-card]`).first();
  await expect(card).toBeVisible();
  return (await card.getAttribute("data-card")) ?? "";
}

test.describe.configure({ mode: "serial" });

test("board moves by keyboard and pointer, through the counters", async ({
  page,
}) => {
  await open(page, "/orders?view=board");
  await expect(page.locator("[data-column]")).toHaveCount(7);
  await expect
    .poll(async () => Object.keys(await laneCounts(page)).length)
    .toBe(7);
  const before = await laneCounts(page);

  const pending = await firstCard(page, "pending");
  await page.locator(`[data-card="${pending}"]`).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Space");
  await expect.poll(() => laneOf(page, pending)).toBe("paid");
  await expect
    .poll(async () => (await laneCounts(page)).pending)
    .toBe(before.pending - 1);
  await expect
    .poll(async () => (await laneCounts(page)).paid)
    .toBe(before.paid + 1);

  const completed = await firstCard(page, "completed");
  await page.locator(`[data-card="${completed}"]`).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => laneOf(page, completed)).toBe("refunded");
  await page.keyboard.press("Escape");
  await expect.poll(() => laneOf(page, completed)).toBe("completed");

  const afterKeys = await laneCounts(page);
  const paid = await firstCard(page, "paid");
  const target = page.locator(
    '[data-column="shipped"] [data-card]:nth-of-type(3)',
  );
  const at = Number(await target.getAttribute("data-index"));
  await dragTo(page, page.locator(`[data-card="${paid}"]`), target);
  await expect.poll(() => laneOf(page, paid)).toBe("shipped");
  const landed = Number(
    await page.locator(`[data-card="${paid}"]`).getAttribute("data-index"),
  );
  expect([at, at + 1]).toContain(landed);
  await expect
    .poll(async () => (await laneCounts(page)).paid)
    .toBe(afterKeys.paid - 1);
  await expect
    .poll(async () => (await laneCounts(page)).shipped)
    .toBe(afterKeys.shipped + 1);
  await expect(page.locator("[data-board-message]")).not.toBeEmpty();
});

test("the board refuses a move the transitions do not allow", async ({
  page,
}) => {
  await open(page, "/orders?view=board");
  await expect
    .poll(async () => Object.keys(await laneCounts(page)).length)
    .toBe(7);
  const before = await laneCounts(page);

  const across = await firstCard(page, "paid");
  await dragTo(
    page,
    page.locator(`[data-card="${across}"]`),
    page.locator('[data-column="completed"] [data-card]').first(),
  );
  await expect.poll(() => laneOf(page, across)).toBe("paid");

  const gap = await firstCard(page, "paid");
  const from = await center(page.locator(`[data-card="${gap}"]`));
  const edge = await page
    .locator("[data-column=shipped]")
    .evaluate((element) => element.getBoundingClientRect().right + 6);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(edge, from.y, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => laneOf(page, gap)).toBe("paid");
  expect(await laneCounts(page)).toEqual(before);
});
