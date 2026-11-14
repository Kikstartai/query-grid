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
      <div className="restyled workspace">
        <header className="workspace-head">
          <SiteBrand />
          <h1>Orders, restyled</h1>
          <CountDisplay />
        </header>
        <p className="workspace-note">
          The same parts as the grid route. One short stylesheet repoints UI
          SDK&apos;s <code>--ui-*</code> tokens and adds three grid rules;
          nothing in the package changed.
        </p>
        <FilterBar />
        <FilterChips />
        <DataGrid />
      </div>
    </OrdersQueryProvider>
  );
}
