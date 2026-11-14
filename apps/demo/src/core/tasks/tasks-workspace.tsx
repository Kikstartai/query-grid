"use client";

import { useState } from "react";

import { createMemorySource } from "@kikstart/query-grid/memory";
import { QueryGridProvider, useGridView } from "@kikstart/query-grid-react";
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

import {
  listTaskRows,
  TASK_COUNT,
  TASK_QUICK_FIELDS,
  TASK_TRANSITIONS,
  TASKS_GRID,
} from "./tasks-grid-def";

const BOARD_DETAIL_FIELDS = ["title", "assignee", "budget"];

function TasksView() {
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

export function TasksWorkspace() {
  const [source] = useState(() =>
    createMemorySource(TASKS_GRID, listTaskRows(), {
      quick: TASK_QUICK_FIELDS,
      transitions: TASK_TRANSITIONS,
    }),
  );
  return (
    <QueryGridProvider def={TASKS_GRID} source={source}>
      <div className="workspace" data-source="memory">
        <header className="workspace-head">
          <SiteBrand />
          <h1>Tasks, in memory</h1>
          <CountDisplay />
          <span className="workspace-spacer" />
          <ViewSwitch views={VIEWS} />
        </header>
        <p className="workspace-note">
          {TASK_COUNT} rows held in the browser. No index is involved, so every
          declared filter and sort is offered in any combination, and filtering,
          sorting, counting and totalling run in JavaScript.
        </p>
        <FilterBar />
        <div className="workspace-chips">
          <FilterSidebar />
          <FilterChips />
        </div>
        <div className="workspace-main">
          <FacetPanel />
          <TasksView />
        </div>
        <footer className="workspace-foot">
          <TotalFooter />
          <ByKikstart />
        </footer>
      </div>
    </QueryGridProvider>
  );
}
