"use client";

import {
  CountDisplay,
  DataGrid,
  FilterBar,
  FilterChips,
} from "@kikstart/query-grid/ui";

import { SiteBrand } from "@/lib/site-brand";

import { OrdersQueryProvider } from "./orders-workspace";

export function RestyledWorkspace({ search }: { search: string }) {
  return (
    <OrdersQueryProvider search={search}>
      <div className="restyled workspace bg-amber-50">
        <header className="workspace-head">
          <SiteBrand />
          <h1 className="font-mono uppercase">
            Orders, restyled with Tailwind
          </h1>
          <CountDisplay />
        </header>
        <p className="workspace-note">
          The same parts as the grid route. A stylesheet of Tailwind
          <code> @apply </code>
          rules over the <code>qg-</code> classes and state attributes restyles
          the Select and the grid rows; nothing in the package changed.
        </p>
        <FilterBar />
        <FilterChips />
        <DataGrid />
      </div>
    </OrdersQueryProvider>
  );
}
