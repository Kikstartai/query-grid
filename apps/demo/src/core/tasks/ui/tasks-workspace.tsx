import { Suspense } from "react";

import {
  CountDisplay,
  FacetPanel,
  FilterBar,
  FilterChips,
  FilterSidebar,
  TotalFooter,
  ViewSwitch,
} from "@kikstart/query-grid-react/ui";

import { AtRequest } from "@/lib/at-request";
import { VIEWS } from "@/lib/site";
import { ByKikstart, SiteBrand } from "@/lib/site-brand";
import { WorkspaceSkeleton } from "@/lib/workspace-skeleton";

import { TASK_COUNT } from "../tasks-grid-def";
import { TasksQueryProvider } from "../tasks-provider";
import { TasksView } from "./tasks-view";

function TasksGrid() {
  return (
    <TasksQueryProvider>
      <div className="workspace-tools">
        <CountDisplay />
        <span className="workspace-spacer" />
        <ViewSwitch views={VIEWS} />
      </div>
      <div className="workspace-body">
        <FilterBar />
        <div className="workspace-chips">
          <FilterSidebar />
          <FilterChips />
        </div>
        <div className="workspace-main">
          <FacetPanel />
          <TasksView />
        </div>
      </div>
      <div className="workspace-total">
        <TotalFooter />
      </div>
    </TasksQueryProvider>
  );
}

export function TasksWorkspace() {
  return (
    <div className="workspace" data-source="memory">
      <header className="workspace-head">
        <SiteBrand />
        <h1>Tasks, in memory</h1>
      </header>
      <p className="workspace-note">
        {TASK_COUNT} rows held in the browser. No index is involved, so every
        declared filter and sort is offered in any combination, and filtering,
        sorting, counting and totalling run in JavaScript.
      </p>
      <Suspense fallback={<WorkspaceSkeleton />}>
        <AtRequest>
          <TasksGrid />
        </AtRequest>
      </Suspense>
      <footer className="workspace-foot">
        <ByKikstart />
      </footer>
    </div>
  );
}
