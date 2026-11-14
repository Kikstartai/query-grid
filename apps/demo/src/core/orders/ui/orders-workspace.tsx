"use client";

import { use, type ReactNode } from "react";

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
} from "@kikstart/query-grid/ui";

import { normalizeSearch, type SearchParams } from "@/lib/read-search";
import { VIEWS } from "@/lib/site";
import { ByKikstart, SiteBrand } from "@/lib/site-brand";

import { ORDERS_GRID } from "../orders-grid-def";

const ORDERS_API = "/api/orders";

const BOARD_DETAIL_FIELDS = ["customer_name", "total", "created_at"];

export interface OrdersWorkspaceProps {
  searchParams: SearchParams;
}

interface OrdersQueryProviderProps extends OrdersWorkspaceProps {
  children: ReactNode;
}

export function OrdersQueryProvider({
  searchParams,
  children,
}: OrdersQueryProviderProps) {
  const search = normalizeSearch(use(searchParams));
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

export function OrdersWorkspace({ searchParams }: OrdersWorkspaceProps) {
  return (
    <OrdersQueryProvider searchParams={searchParams}>
      <div className="workspace">
        <header className="workspace-head">
          <SiteBrand />
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
        <footer className="workspace-foot">
          <TotalFooter />
          <ByKikstart />
        </footer>
      </div>
    </OrdersQueryProvider>
  );
}
