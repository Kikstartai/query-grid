import Link from "next/link";

import {
  DEMO_LINKS,
  INSTALL_LINE,
  PACKAGE_NAME,
  PART_NAMES,
  REPO_URL,
} from "@/lib/site";

const PRINCIPLES = [
  {
    title: "The UI reflects what the data layer can do",
    body: "A filter, a sort or a combination of the two is offered only when an index answers it fast. The server refuses any other with a 400.",
  },
  {
    title: "Composition, not a monolith",
    body: "The filter bar, sidebar, chips, facets, count, total, grid, list and board are separate parts around one query state. None owns it.",
  },
  {
    title: "Very large data sets are never a constraint",
    body: "Sorting and filtering happen in Postgres over indexes, paging is keyset, and the browser renders only the visible window.",
  },
];

export default function LandingPage() {
  return (
    <main className="landing">
      <header className="landing-hero">
        <p className="landing-kicker">{PACKAGE_NAME}</p>
        <h1>A filter and data grid that only offers what an index answers</h1>
        <p className="landing-lead">
          A composable filter and data grid for very large Postgres tables,
          built on UI SDK. You declare the query shapes your indexes serve; the
          controls offer exactly those, and the server refuses everything else.
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
      <section className="landing-principles" aria-label="Principles">
        {PRINCIPLES.map((principle, index) => (
          <article key={principle.title} className="landing-card">
            <span className="landing-number">{index + 1}</span>
            <h2>{principle.title}</h2>
            <p>{principle.body}</p>
          </article>
        ))}
      </section>
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
      <footer className="landing-footer">
        MIT licensed. The demo runs on a Neon Free-plan Postgres holding
        620,000 orders; every sorted query is an index scan of about a
        millisecond.
      </footer>
    </main>
  );
}
