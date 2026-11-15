"use client";

import { useGridView } from "@kikstart/query-grid-react";
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
} from "@kikstart/query-grid-react/ui";

import { VIEWS } from "@/lib/site";
import { ByKikstart, SiteBrand } from "@/lib/site-brand";

import { OrdersQueryProvider } from "../orders-provider";

const BOARD_DETAIL_FIELDS = ["customer_name", "total", "created_at"];

interface OrdersWorkspaceProps {
  dir?: "rtl";
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

export function OrdersWorkspace({ dir }: OrdersWorkspaceProps) {
  return (
    <OrdersQueryProvider>
      <div className="workspace" dir={dir} data-dir={dir}>
        <header className="workspace-head">
          <SiteBrand />
          <h1>{dir ? "Orders, right to left" : "Orders"}</h1>
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
