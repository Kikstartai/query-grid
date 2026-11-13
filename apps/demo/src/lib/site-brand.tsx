import Image from "next/image";
import Link from "next/link";

import { KIKSTART_URL } from "./site";

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
      <Image
        src="/brand/kikstart-wordmark.svg"
        alt="kikstart"
        width={Math.round(height * WORDMARK_RATIO)}
        height={height}
        unoptimized
      />
    </a>
  );
}

export function SiteBrand() {
  return (
    <div className="site-brand" data-brand="header">
      <Link className="site-brand-home" href="/">
        <Image
          src="/brand/kikstart-mark.svg"
          alt=""
          width={22}
          height={22}
          unoptimized
        />
        <span>query-grid</span>
      </Link>
      <ByKikstart />
    </div>
  );
}
