"use client";

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

import { SiteBrand } from "@/lib/site-brand";

import {
  OrdersBoard,
  OrdersCardList,
  OrdersQueryProvider,
} from "./orders-workspace";

const PARTS = {
  "filter-bar": FilterBar,
  chips: FilterChips,
  sidebar: FilterSidebar,
  facets: FacetPanel,
  count: CountDisplay,
  total: TotalFooter,
  grid: DataGrid,
  list: OrdersCardList,
  board: OrdersBoard,
} as const;

type PartName = keyof typeof PARTS;

function QueryReadout() {
  const query = useQueryState();
  return (
    <pre className="part-readout" data-part="query-readout">
      {JSON.stringify(query)}
    </pre>
  );
}

interface OrdersPartProps {
  part: string;
  search: string;
}

export function OrdersPart({ part, search }: OrdersPartProps) {
  const Part = PARTS[part as PartName];
  if (!Part) {
    return <p className="part-missing">Unknown part: {part}</p>;
  }
  return (
    <OrdersQueryProvider search={search}>
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
