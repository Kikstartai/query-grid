"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { QueryGridProvider, useGridView } from "@kikstart/query-grid";
import {
  CardList,
  CountDisplay,
  DataGrid,
  FacetPanel,
  FilterBar,
  FilterChips,
  FilterSidebar,
  StatusBoard,
  TotalFooter,
  ViewSwitch,
  type ViewOption,
} from "@kikstart/query-grid/ui";

import { ORDERS_GRID } from "../orders-grid-def";

const ORDERS_API = "/api/orders";

const VIEWS: ViewOption[] = [
  { view: "grid", label: "Grid" },
  { view: "list", label: "List" },
  { view: "board", label: "Board" },
];

const BOARD_DETAIL_FIELDS = ["customer_name", "total", "created_at"];

interface OrdersQueryProviderProps {
  search: string;
  children: ReactNode;
}

export function OrdersQueryProvider({
  search,
  children,
}: OrdersQueryProviderProps) {
  return (
    <QueryGridProvider def={ORDERS_GRID} search={search} basePath={ORDERS_API}>
      {children}
    </QueryGridProvider>
  );
}

export function OrdersCardList() {
  return <CardList titleField="order_number" badgeField="status_code" />;
}

export function OrdersBoard() {
  return (
    <StatusBoard titleField="order_number" detailFields={BOARD_DETAIL_FIELDS} />
  );
}

function OrdersView() {
  const view = useGridView();
  if (view === "list") {
    return <OrdersCardList />;
  }
  if (view === "board") {
    return <OrdersBoard />;
  }
  return <DataGrid />;
}

export function OrdersWorkspace({ search }: { search: string }) {
  return (
    <OrdersQueryProvider search={search}>
      <div className="workspace">
        <header className="workspace-head">
          <Link className="workspace-home" href="/">
            query-grid
          </Link>
          <h1>Orders</h1>
          <CountDisplay />
          <span className="workspace-spacer" />
          <ViewSwitch views={VIEWS} />
        </header>
        <FilterBar />
        <div className="workspace-chips">
          <FilterSidebar />
          <FilterChips />
        </div>
        <div className="workspace-main">
          <FacetPanel />
          <OrdersView />
        </div>
        <TotalFooter />
      </div>
    </OrdersQueryProvider>
  );
}
