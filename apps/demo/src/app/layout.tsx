import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import "@ui-sdk/core/web.css";
import "@kikstart/query-grid-react/styles.css";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title:
    "query-grid: a filter and data grid that only offers what an index answers",
  description:
    "A composable filter and data grid for very large Postgres tables. The UI only offers the filter and sort combinations an index answers, and the server refuses the rest.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
