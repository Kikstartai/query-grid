"use client";

import type { ReactNode } from "react";

import { useGridView } from "@kikstart/query-grid-react";
import type { GridDef } from "@kikstart/query-grid-react/components";
import { CardList, StatusBoard } from "@kikstart/query-grid-react/ui";

import { DemoGrid } from "@/lib/demo-grid";

import { TASK_TRANSITIONS, TASKS_GRID_DEF } from "../tasks-grid-def";

const BOARD_DETAIL_FIELDS = ["title", "assignee", "budget"];

interface TaskViewsProps {
  children: ReactNode;
}

interface TasksViewProps {
  def?: GridDef;
}

export function TaskViews({ children }: TaskViewsProps) {
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
  return children;
}

export function TasksView({ def = TASKS_GRID_DEF }: TasksViewProps) {
  return (
    <TaskViews>
      <DemoGrid def={def} labelField="title" />
    </TaskViews>
  );
}
