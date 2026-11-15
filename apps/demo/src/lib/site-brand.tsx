import Link from "next/link";

import { KIKSTART_URL } from "./site";
import { ThemeToggle } from "./theme-toggle";

const WORDMARK_RATIO = 342 / 84;

export function ByKikstart({ height = 18 }: { height?: number }) {
  return (
    <a
      className="by-kikstart"
      href={KIKSTART_URL}
      aria-label="by kikstart"
      data-brand="by-kikstart"
    >
      <span>by</span>
      <span
        className="brand-logo"
        data-logo="wordmark"
        style={{ width: Math.round(height * WORDMARK_RATIO), height }}
      />
    </a>
  );
}

export function SiteBrand() {
  return (
    <div className="site-brand" data-brand="header">
      <Link className="site-brand-home" href="/">
        <span
          className="brand-logo"
          data-logo="mark"
          style={{ width: 22, height: 22 }}
        />
        <span>query-grid</span>
      </Link>
      <ByKikstart />
      <ThemeToggle />
    </div>
  );
}
