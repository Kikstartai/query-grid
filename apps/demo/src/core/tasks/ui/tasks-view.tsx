"use client";

import { useGridView } from "@kikstart/query-grid-react";
import { CardList, DataGrid, StatusBoard } from "@kikstart/query-grid-react/ui";

import { TASK_TRANSITIONS } from "../tasks-grid-def";

const BOARD_DETAIL_FIELDS = ["title", "assignee", "budget"];

export function TasksView() {
  const view = useGridView();
  if (view === "list") {
    return <CardList titleField="number" badgeField="status" />;
  }
  if (view === "board") {
    return (
      <StatusBoard
        titleField="number"
        detailFields={BOARD_DETAIL_FIELDS}
        transitions={TASK_TRANSITIONS}
      />
    );
  }
  return <DataGrid />;
}
