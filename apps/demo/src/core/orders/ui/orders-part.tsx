"use client";

import { use, type ComponentType } from "react";

import { useQueryState } from "@kikstart/query-grid";
import {
  CountDisplay,
  DataGrid,
  FacetPanel,
  FilterBar,
  FilterChips,
  FilterSidebar,
  TotalFooter,
} from "@kikstart/query-grid/ui";

import { PART_NAMES } from "@/lib/site";
import { SiteBrand } from "@/lib/site-brand";

import {
  OrdersBoard,
  OrdersCardList,
  OrdersQueryProvider,
  type OrdersWorkspaceProps,
} from "./orders-workspace";

type PartName = (typeof PART_NAMES)[number];

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

interface OrdersPartProps extends OrdersWorkspaceProps {
  params: Promise<{ part: string }>;
}

export function OrdersPart({ params, searchParams }: OrdersPartProps) {
  const { part } = use(params);
  const Part = PARTS[part as PartName];
  if (!Part) {
    return <p className="part-missing">Unknown part: {part}</p>;
  }
  return (
    <OrdersQueryProvider searchParams={searchParams}>
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
