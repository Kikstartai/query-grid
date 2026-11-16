"use client";

import { useGridView } from "@kikstart/query-grid-react";
import { CardList, StatusBoard } from "@kikstart/query-grid-react/ui";

import { DemoGrid } from "@/lib/demo-grid";

import { TASK_TRANSITIONS, TASKS_GRID_DEF } from "../tasks-grid-def";

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
  return <DemoGrid def={TASKS_GRID_DEF} labelField="title" />;
}
