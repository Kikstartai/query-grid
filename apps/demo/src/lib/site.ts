import type { ViewOption } from "@kikstart/query-grid-react/ui";

export const KIKSTART_URL = "https://kikstart.ai";
export const REPO_URL = "https://github.com/Kikstartai/query-grid";
export const PACKAGE_NAME = "@kikstart/query-grid";
export const INSTALL_LINE = `npm install ${PACKAGE_NAME} ${PACKAGE_NAME}-react ${PACKAGE_NAME}-postgres @ui-sdk/core@beta @ui-sdk/react@beta`;

export const VIEWS: ViewOption[] = [
  { view: "grid", label: "Grid" },
  { view: "list", label: "List" },
  { view: "board", label: "Board" },
];

interface DemoLink {
  href: string;
  label: string;
  note: string;
}

export const DEMO_LINKS: DemoLink[] = [
  {
    href: "/orders",
    label: "Grid",
    note: "620,000 orders on Postgres: filters, facets, counts, totals and keyset paging",
  },
  {
    href: "/orders?view=list",
    label: "List",
    note: "the same query as a virtualised card list",
  },
  {
    href: "/orders?view=board",
    label: "Board",
    note: "one keyset feed per status, with server-checked moves",
  },
  {
    href: "/memory",
    label: "In memory",
    note: "the same parts over 400 rows held in the browser",
  },
  {
    href: "/restyled",
    label: "Restyled",
    note: "the same parts restyled by repointing UI SDK's tokens in one short stylesheet",
  },
  {
    href: "/rtl",
    label: "Right to left",
    note: 'the grid route under dir="rtl": pinning, resize, the sidebar and the chips mirror',
  },
  {
    href: "/components",
    label: "Base components",
    note: "the controlled components with plain props: no provider, no query state, no server",
  },
  {
    href: "/parts/facets",
    label: "One part alone",
    note: "the facet panel mounted by itself over the query state",
  },
];

export const PART_NAMES = [
  "filter-bar",
  "chips",
  "sidebar",
  "facets",
  "count",
  "total",
  "grid",
  "list",
  "board",
] as const;

export type PartName = (typeof PART_NAMES)[number];

export function isPartName(value: string): value is PartName {
  return (PART_NAMES as readonly string[]).includes(value);
}
