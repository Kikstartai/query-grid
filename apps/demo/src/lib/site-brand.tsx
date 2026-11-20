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

interface SiteBrandProps {
  back?: boolean;
}

export function BackLink() {
  return (
    <Link className="back-link" href="/" aria-label="Back" data-back-link>
      <svg
        className="back-link-icon"
        viewBox="0 0 16 16"
        width="16"
        height="16"
        aria-hidden="true"
      >
        <path
          d="M10 3 5 8l5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="back-link-label">Back</span>
    </Link>
  );
}

export function SiteBrand({ back = true }: SiteBrandProps) {
  return (
    <div className="site-brand" data-brand="header">
      {back ? <BackLink /> : null}
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
