import { Suspense } from "react";

import { gridDefRunnable } from "@kikstart/query-grid";

import {
  CountDisplay,
  DataGrid,
  FilterChips,
} from "@kikstart/query-grid-react/ui";

import { SiteBrand } from "@/lib/site-brand";
import {
  SkeletonChips,
  SkeletonFilters,
  SkeletonGrid,
  SkeletonTools,
} from "@/lib/workspace-skeleton";

import {
  ORDER_BAR_FIELDS,
  ORDER_CONTAINS_FIELDS,
  ORDERS_GRID_DEF,
} from "../orders-grid-def";
import { OrdersFilterBar } from "./orders-view";
import { OrdersQueryProvider } from "../orders-provider";

function RestyledSkeleton() {
  return (
    <>
      <SkeletonTools />
      <div
        className="workspace-body"
        data-skeleton="restyled"
        role="status"
        aria-label="The grid is on its way"
      >
        <SkeletonFilters
          def={ORDERS_GRID_DEF}
          runnable={gridDefRunnable(ORDERS_GRID_DEF)}
          fields={ORDER_BAR_FIELDS}
          contains={ORDER_CONTAINS_FIELDS}
        />
        <SkeletonChips />
        <SkeletonGrid />
      </div>
    </>
  );
}

function RestyledGrid() {
  return (
    <OrdersQueryProvider>
      <div className="workspace-tools">
        <CountDisplay />
      </div>
      <div className="workspace-body">
        <OrdersFilterBar />
        <FilterChips />
        <DataGrid />
      </div>
    </OrdersQueryProvider>
  );
}

export function RestyledWorkspace() {
  return (
    <div className="restyled workspace">
      <header className="workspace-head">
        <SiteBrand />
        <h1>Orders, restyled</h1>
      </header>
      <p className="workspace-note">
        The same parts as the grid route. One short stylesheet repoints UI
        SDK&apos;s <code>--ui-*</code> tokens and adds three grid rules; nothing
        in the package changed.
      </p>
      <Suspense fallback={<RestyledSkeleton />}>
        <RestyledGrid />
      </Suspense>
    </div>
  );
}
