import { Suspense } from "react";

import {
  CountDisplay,
  FacetPanel,
  FilterBar,
  FilterChips,
  FilterSidebar,
  TotalFooter,
  ViewSwitch,
} from "@kikstart/query-grid-react/ui";

import { AtRequest } from "@/lib/at-request";
import { VIEWS } from "@/lib/site";
import { ByKikstart, SiteBrand } from "@/lib/site-brand";
import {
  SkeletonChips,
  SkeletonFacets,
  SkeletonFilters,
  SkeletonGrid,
  SkeletonTools,
  SkeletonTotal,
} from "@/lib/workspace-skeleton";

import { OrdersQueryProvider } from "../orders-provider";
import { OrdersView } from "./orders-view";

interface OrdersWorkspaceProps {
  title: string;
  dir?: "rtl";
}

export function OrdersSkeleton() {
  return (
    <>
      <SkeletonTools />
      <div className="workspace-body" data-skeleton="orders">
        <SkeletonFilters />
        <SkeletonChips />
        <div className="workspace-main">
          <SkeletonFacets />
          <SkeletonGrid />
        </div>
      </div>
      <SkeletonTotal />
    </>
  );
}

function OrdersGrid() {
  return (
    <OrdersQueryProvider>
      <div className="workspace-tools">
        <CountDisplay />
        <span className="workspace-spacer" />
        <ViewSwitch views={VIEWS} />
      </div>
      <div className="workspace-body">
        <FilterBar />
        <div className="workspace-chips">
          <FilterSidebar />
          <FilterChips />
        </div>
        <div className="workspace-main">
          <FacetPanel />
          <OrdersView />
        </div>
      </div>
      <div className="workspace-total">
        <TotalFooter />
      </div>
    </OrdersQueryProvider>
  );
}

export function OrdersWorkspace({ title, dir }: OrdersWorkspaceProps) {
  return (
    <div className="workspace" dir={dir} data-dir={dir}>
      <header className="workspace-head">
        <SiteBrand />
        <h1>{title}</h1>
      </header>
      <Suspense fallback={<OrdersSkeleton />}>
        <AtRequest>
          <OrdersGrid />
        </AtRequest>
      </Suspense>
      <footer className="workspace-foot">
        <ByKikstart />
      </footer>
    </div>
  );
}
