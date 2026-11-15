"use client";

import type { ComponentType } from "react";

import { useQueryState } from "@kikstart/query-grid-react";
import {
  CountDisplay,
  DataGrid,
  FacetPanel,
  FilterBar,
  FilterChips,
  FilterSidebar,
  TotalFooter,
} from "@kikstart/query-grid-react/ui";

import type { PartName } from "@/lib/site";
import { SiteBrand } from "@/lib/site-brand";

import { OrdersQueryProvider } from "../orders-provider";
import { OrdersBoard, OrdersCardList } from "./orders-workspace";

const PARTS: Record<PartName, ComponentType> = {
  "filter-bar": FilterBar,
  chips: FilterChips,
  sidebar: FilterSidebar,
  facets: FacetPanel,
  count: CountDisplay,
  total: TotalFooter,
  grid: DataGrid,
  list: OrdersCardList,
  board: OrdersBoard,
};

function QueryReadout() {
  const query = useQueryState();
  return (
    <pre className="part-readout" data-part="query-readout">
      {JSON.stringify(query)}
    </pre>
  );
}

interface OrdersPartProps {
  part: PartName;
}

export function OrdersPart({ part }: OrdersPartProps) {
  const Part = PARTS[part];
  return (
    <OrdersQueryProvider>
      <div className="part-page" data-solo-part={part}>
        <SiteBrand />
        <p className="part-intro">
          The <code>{part}</code> part mounted alone. It reads and writes the
          shared query state shown below, and the URL.
        </p>
        <QueryReadout />
        <Part />
      </div>
    </OrdersQueryProvider>
  );
}
