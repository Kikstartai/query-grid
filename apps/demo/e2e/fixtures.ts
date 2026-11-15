import {
  expect,
  test as base,
  type Locator,
  type Page,
} from "@playwright/test";

interface Fixtures {
  pageErrors: string[];
}

export const test = base.extend<Fixtures>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        // A refused request is the server doing its job; the browser still logs the status.
        if (
          message.type() === "error" &&
          !message.text().startsWith("Failed to load resource")
        ) {
          errors.push(message.text());
        }
      });
      await use(errors);
      expect(errors, "browser errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export const bar = (page: Page) => page.locator("[data-part=filter-bar]");
export const countValue = (page: Page) => page.locator("[data-count]");
export const total = (page: Page) => page.locator("[data-part=total]");
export const loaded = (page: Page) => page.locator("[data-status=loaded]");
export const scroller = (page: Page) =>
  page.locator("[data-part=grid-scroller]");

export async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-skeleton]")).toHaveCount(0);
}

export async function openGrid(page: Page, path: string) {
  await open(page, path);
  await expect(loaded(page)).toBeVisible();
}

export async function pick(page: Page, field: string, ...options: string[]) {
  await bar(page).locator(`[data-filter="${field}"]`).click();
  for (const option of options) {
    await page.locator(`[data-option="${option}"]`).click();
    await expect(page).toHaveURL(new RegExp(`f\\.${field}=${option}`));
  }
  await page.keyboard.press("Escape");
}

export async function quick(page: Page, text: string) {
  const input = bar(page).locator("[data-filter=quick]");
  await input.fill(text);
  await input.press("Enter");
}

export async function apiCount(page: Page, query: string): Promise<number> {
  const response = await page.request.get(`/api/orders/count?${query}`);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { count: number }).count;
}

export async function expectCount(
  page: Page,
  count: number,
  source = "counter",
) {
  await expect(countValue(page)).toHaveAttribute("data-count", String(count));
  await expect(countValue(page)).toHaveAttribute("data-count-source", source);
}

export async function texts(locator: Locator): Promise<string[]> {
  return (await locator.allTextContents()).map((text) => text.trim());
}

export async function attrs(locator: Locator, name: string): Promise<string[]> {
  return locator.evaluateAll(
    (elements, attribute) =>
      elements.map((element) => element.getAttribute(attribute) ?? ""),
    name,
  );
}

export async function urlPath(page: Page): Promise<string> {
  const url = new URL(page.url());
  return url.pathname + url.search;
}

export async function width(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => Math.round(element.getBoundingClientRect().width));
}

export async function expectWidth(page: Page, field: string, px: number) {
  await expect.poll(() => width(page, `[data-header="${field}"]`)).toBe(px);
}

export async function headers(page: Page, n = 8): Promise<string> {
  return (await attrs(page.locator("[data-header]"), "data-header"))
    .slice(0, n)
    .join(",");
}

export async function center(
  locator: Locator,
): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("element has no box");
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function dragBy(
  page: Page,
  locator: Locator,
  dx: number,
  options: { hold?: boolean } = {},
) {
  const { x, y } = await center(locator);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 6 });
  if (!options.hold) {
    await page.mouse.up();
  }
}

export async function dragTo(page: Page, from: Locator, to: Locator) {
  const a = await center(from);
  const b = await center(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
}

export async function pressTimes(page: Page, key: string, times: number) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
  }
}

export async function rowGaps(
  page: Page,
): Promise<{ rows: number; gaps: number; heights: number[] }> {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-row]")]
      .map((element) => element.getBoundingClientRect())
      .sort((a, b) => a.top - b.top);
    let gaps = 0;
    for (let i = 1; i < rows.length; i++) {
      if (Math.abs(rows[i].top - rows[i - 1].bottom) > 1) {
        gaps++;
      }
    }
    return {
      rows: rows.length,
      gaps,
      heights: rows.map((row) => Math.round(row.height)),
    };
  });
}
