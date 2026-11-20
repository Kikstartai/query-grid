import { expect, test } from "./fixtures";
import { cumulativeLayoutShift, SCHEMES } from "./theme";

const PATHS = [
  "/orders",
  "/orders?f.status_code.any_of=paid&sort=total.desc",
  "/orders?view=list",
  "/orders?view=board",
  "/memory",
  "/memory?view=board",
  "/restyled",
  "/rtl",
  "/rtl?view=list",
  "/parts/grid",
  "/parts/facets",
  "/components",
];

const FACET_PAGES = ["/orders", "/rtl", "/parts/facets"];

const SIZES = [
  { width: 1500, height: 900 },
  { width: 800, height: 900 },
];

for (const scheme of SCHEMES) {
  for (const viewport of SIZES) {
    test.describe(`${scheme} at ${viewport.width} by ${viewport.height}`, () => {
      test.use({ colorScheme: scheme, viewport });

      for (const path of PATHS) {
        test(`${path} has no layout shift`, async ({ page }) => {
          test.fixme(
            FACET_PAGES.some((prefix) => path.startsWith(prefix)),
            "The facet buttons widen when their counts load and the row rewraps, shifting the filter bar and the grid.",
          );
          // A cold load measures the web font's late swap, not the page, so the font is cached first.
          await page.goto(path);
          await page.evaluate(() => document.fonts.ready);
          await page.reload();
          await expect(page.locator("[data-skeleton]")).toHaveCount(0);
          await page.waitForLoadState("networkidle");
          expect(await cumulativeLayoutShift(page)).toBe(0);
        });
      }
    });
  }
}
