"use client";

import { useGridView } from "@kikstart/query-grid-react";
import { CardList, DataGrid, StatusBoard } from "@kikstart/query-grid-react/ui";

const BOARD_DETAIL_FIELDS = ["customer_name", "total", "created_at"];

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
  return <DataGrid />;
}
