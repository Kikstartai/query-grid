import type { Page } from "@playwright/test";

export const THEME_PAGES = [
  "/",
  "/orders",
  "/orders?view=list",
  "/orders?view=board",
  "/orders?f.assignee=_empty&f.assignee=glen",
  "/orders?f.status_code=!cancelled&r.created_at=last-7-days",
  "/orders?f.status_code=failed&c.note=gift&r.total=20000..90000",
  "/orders?f.status_code=failed&f.channel=phone&match=any",
  "/orders?group=status_code",
  "/orders?f.status_code=failed&group=region",
  "/memory",
  "/memory?view=board",
  "/memory?group=team",
  "/restyled",
  "/rtl",
  "/rtl?view=list",
  "/rtl?f.status_code=!cancelled&r.created_at=last-7-days",
  "/rtl?f.status_code=failed&c.note=gift&match=any",
  "/rtl?group=status_code",
  "/components",
  "/parts/filter-bar",
  "/parts/chips",
  "/parts/sidebar",
  "/parts/facets",
  "/parts/count",
  "/parts/total",
  "/parts/grid",
  "/parts/list",
  "/parts/board",
  "/nope",
];

export const SCHEMES = ["light", "dark"] as const;
export type Scheme = (typeof SCHEMES)[number];

export interface Paint {
  theme: string;
  body: Scheme;
}

export interface Contrast {
  texts: number;
  min: number;
  low: string[];
}

export function paint(page: Page): Promise<Paint> {
  return page.evaluate(() => {
    const ctx = document
      .createElement("canvas")
      .getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#000";
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return {
      theme: document.documentElement.dataset.theme ?? "none",
      body: r + g + b < 384 ? ("dark" as const) : ("light" as const),
    };
  });
}

export function firstFrameProbe() {
  requestAnimationFrame(() => {
    const probe = document.createElement("i");
    probe.style.color = "var(--background)";
    document.documentElement.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    const ctx = document
      .createElement("canvas")
      .getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    (window as unknown as { __firstFrame: unknown }).__firstFrame = {
      theme: document.documentElement.dataset.theme ?? "none",
      body: r + g + b < 384 ? "dark" : "light",
    };
  });
}

export function contrast(page: Page): Promise<Contrast> {
  return page.evaluate(() => {
    const ctx = document
      .createElement("canvas")
      .getContext("2d", { willReadFrequently: true })!;
    const seen = new Map<string, number[]>();
    const rgb = (c: string) => {
      if (!seen.has(c)) {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "#000";
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        seen.set(c, [d[0], d[1], d[2], d[3] / 255]);
      }
      return seen.get(c)!;
    };
    const lum = (c: number[]) => {
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: number[], b: number[]) => {
      const x = lum(a);
      const y = lum(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const back = (el: Element) => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const c = rgb(getComputedStyle(e).backgroundColor);
        if (c[3] > 0.5) {
          return c;
        }
      }
      return rgb(getComputedStyle(document.body).backgroundColor);
    };
    const inactive = (el: Element) => {
      if (
        el.closest(
          "[disabled], [aria-disabled=true], [data-disabled], [data-unavailable], [aria-hidden=true]",
        )
      ) {
        return true;
      }
      for (let e: Element | null = el; e; e = e.parentElement) {
        if (Number(getComputedStyle(e).opacity) < 1) {
          return true;
        }
      }
      return false;
    };
    const low: string[] = [];
    let min = 99;
    let texts = 0;
    for (const el of document.querySelectorAll("body *")) {
      if (
        ![...el.childNodes].some(
          (c) => c.nodeType === 3 && c.textContent?.trim(),
        )
      ) {
        continue;
      }
      const box = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (
        box.width < 2 ||
        box.height < 2 ||
        cs.visibility !== "visible" ||
        inactive(el)
      ) {
        continue;
      }
      const r = ratio(rgb(cs.color), back(el));
      const size = parseFloat(cs.fontSize);
      const large =
        size >= 24 || (size >= 18.6 && Number(cs.fontWeight) >= 700);
      texts++;
      min = Math.min(min, r);
      if (r < (large ? 3 : 4.5)) {
        low.push(
          `${el.tagName.toLowerCase()} [${el.textContent?.trim().slice(0, 24)}] ${r.toFixed(2)}`,
        );
      }
    }
    return { texts, min: Number(min.toFixed(2)), low };
  });
}

export function cumulativeLayoutShift(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            total += (entry as unknown as { value: number }).value;
          }
        }).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => resolve(total), 300);
      }),
  );
}
