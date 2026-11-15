import { Suspense, type ComponentType } from "react";

import {
  CountDisplay,
  DataGrid,
  FacetPanel,
  FilterChips,
  TotalFooter,
} from "@kikstart/query-grid-react/ui";

import type { PartName } from "@/lib/site";
import { SiteBrand } from "@/lib/site-brand";

import { OrdersQueryProvider } from "../orders-provider";
import {
  OrdersBoard,
  OrdersCardList,
  OrdersFilterBar,
  OrdersFilterSidebar,
} from "./orders-view";
import { QueryReadout } from "./query-readout";

const PARTS: Record<PartName, ComponentType> = {
  "filter-bar": OrdersFilterBar,
  chips: FilterChips,
  sidebar: OrdersFilterSidebar,
  facets: FacetPanel,
  count: CountDisplay,
  total: TotalFooter,
  grid: DataGrid,
  list: OrdersCardList,
  board: OrdersBoard,
};

interface OrdersPartProps {
  part: PartName;
}

function OrdersPartSkeleton() {
  return (
    <>
      <span className="skeleton part-readout" aria-hidden="true" />
      <span
        className="skeleton skeleton-part"
        data-skeleton="part"
        role="status"
        aria-label="The part is on its way"
      />
    </>
  );
}

export function OrdersPart({ part }: OrdersPartProps) {
  const Part = PARTS[part];
  return (
    <div className="part-page" data-solo-part={part}>
      <SiteBrand />
      <p className="part-intro">
        The <code>{part}</code> part mounted alone. It reads and writes the
        shared query state shown below, and the URL.
      </p>
      <Suspense fallback={<OrdersPartSkeleton />}>
        <OrdersQueryProvider>
          <QueryReadout />
          <Part />
        </OrdersQueryProvider>
      </Suspense>
    </div>
  );
}
