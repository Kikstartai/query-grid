"use client";

import { useGridView } from "@kikstart/query-grid-react";
import { CardList, DataGrid, StatusBoard } from "@kikstart/query-grid-react/ui";

const BOARD_DETAIL_FIELDS = ["title", "assignee", "budget"];

export function TasksView() {
  const view = useGridView();
  if (view === "list") {
    return <CardList titleField="number" badgeField="status" />;
  }
  if (view === "board") {
    return (
      <StatusBoard titleField="number" detailFields={BOARD_DETAIL_FIELDS} />
    );
  }
  return <DataGrid />;
}
