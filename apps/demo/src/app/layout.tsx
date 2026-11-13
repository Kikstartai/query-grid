import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@kikstart/query-grid/ui/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "query-grid: a filter and data grid that only offers what an index answers",
  description:
    "A composable filter and data grid for very large Postgres tables. The UI only offers the filter and sort combinations an index answers, and the server refuses the rest.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
