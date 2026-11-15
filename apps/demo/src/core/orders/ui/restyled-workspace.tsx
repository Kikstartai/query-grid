import { Suspense } from "react";

import {
  CountDisplay,
  DataGrid,
  FilterBar,
  FilterChips,
} from "@kikstart/query-grid-react/ui";

import { AtRequest } from "@/lib/at-request";
import { SiteBrand } from "@/lib/site-brand";
import {
  SkeletonChips,
  SkeletonFilters,
  SkeletonGrid,
  SkeletonTools,
} from "@/lib/workspace-skeleton";

import { OrdersQueryProvider } from "../orders-provider";

export function RestyledSkeleton() {
  return (
    <>
      <SkeletonTools />
      <div
        className="workspace-body"
        data-skeleton="restyled"
        role="status"
        aria-label="The grid is on its way"
      >
        <SkeletonFilters />
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
        <FilterBar />
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
        <AtRequest>
          <RestyledGrid />
        </AtRequest>
      </Suspense>
    </div>
  );
}
