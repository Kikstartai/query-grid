"use client";

import { useGridView } from "@kikstart/query-grid-react";
import {
  CardList,
  FilterBar,
  FilterSidebar,
  StatusBoard,
} from "@kikstart/query-grid-react/ui";

import { DemoGrid } from "@/lib/demo-grid";

import {
  ORDER_BAR_FIELDS,
  ORDER_TEXT_FIELDS,
  ORDERS_GRID_DEF,
} from "../orders-grid-def";

const BOARD_DETAIL_FIELDS = ["customer_name", "total", "created_at"];

export function OrdersFilterBar() {
  return <FilterBar fields={ORDER_BAR_FIELDS} texts={ORDER_TEXT_FIELDS} />;
}

export function OrdersFilterSidebar() {
  return <FilterSidebar texts={ORDER_TEXT_FIELDS} />;
}

export function OrdersCardList() {
  return <CardList titleField="order_number" badgeField="status_code" />;
}

export function OrdersBoard() {
  return (
    <StatusBoard titleField="order_number" detailFields={BOARD_DETAIL_FIELDS} />
  );
}

export function OrdersView() {
  const view = useGridView();
  if (view === "list") {
    return <OrdersCardList />;
  }
  if (view === "board") {
    return <OrdersBoard />;
  }
  return <DemoGrid def={ORDERS_GRID_DEF} labelField="order_number" />;
}
