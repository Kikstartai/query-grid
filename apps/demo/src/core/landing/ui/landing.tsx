import Link from "next/link";

import {
  DEMO_LINKS,
  INSTALL_LINE,
  PACKAGE_NAME,
  PART_NAMES,
  REPO_URL,
} from "@/lib/site";
import { ByKikstart, SiteBrand } from "@/lib/site-brand";

import { PRINCIPLES } from "../landing-copy";

export function LandingNav() {
  return (
    <nav className="landing-nav" aria-label="Site">
      <SiteBrand back={false} />
      <a href={REPO_URL}>GitHub</a>
    </nav>
  );
}

export function LandingHero() {
  return (
    <header className="landing-hero">
      <p className="landing-kicker">{PACKAGE_NAME}</p>
      <h1>A filter and data grid that only offers what an index answers</h1>
      <p className="landing-lead">
        A composable filter and data grid for very large Postgres tables, built
        on UI SDK. You declare your indexes; the controls offer exactly the
        queries they answer, and the server refuses everything else.
      </p>
      <pre className="landing-install" data-install>
        <code>{INSTALL_LINE}</code>
      </pre>
      <div className="landing-actions">
        <Link className="landing-primary" href="/orders">
          Open the live grid
        </Link>
        <a className="landing-secondary" href={REPO_URL}>
          GitHub
        </a>
      </div>
    </header>
  );
}

export function LandingPrinciples() {
  return (
    <section className="landing-principles" aria-label="Principles">
      {PRINCIPLES.map((principle, index) => (
        <article key={principle.title} className="landing-card">
          <span className="landing-number">{index + 1}</span>
          <h2>{principle.title}</h2>
          <p>{principle.body}</p>
        </article>
      ))}
    </section>
  );
}

export function LandingDemos() {
  return (
    <section className="landing-demos" aria-label="Demos">
      <h2>See it run</h2>
      <ul>
        {DEMO_LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href}>{link.label}</Link>
            <span>{link.note}</span>
          </li>
        ))}
      </ul>
      <p className="landing-parts">
        Every part also mounts alone:{" "}
        {PART_NAMES.map((part) => (
          <Link key={part} href={`/parts/${part}`}>
            {part}
          </Link>
        ))}
      </p>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <ByKikstart height={20} />
      MIT licensed. The demo runs on a Neon Free-plan Postgres holding 620,000
      orders; every sorted query is an index scan of about a millisecond.
    </footer>
  );
}
