import { Suspense } from "react";

import { memoryCapabilities } from "@kikstart/query-grid/memory";

import { ByKikstart, SiteBrand } from "@/lib/site-brand";
import { WorkspaceParts } from "@/lib/workspace-parts";
import { WorkspaceSkeleton } from "@/lib/workspace-skeleton";

import {
  TASK_COUNT,
  TASK_FILTER_FIELDS,
  TASK_QUICK_FIELDS,
  TASKS_GRID_DEF,
} from "../tasks-grid-def";
import { TasksQueryProvider } from "../tasks-provider";
import { TasksView } from "./tasks-view";

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
      <Suspense
        fallback={
          <WorkspaceSkeleton
            def={TASKS_GRID_DEF}
            capabilities={memoryCapabilities(TASKS_GRID_DEF, TASK_QUICK_FIELDS)}
            fields={TASK_FILTER_FIELDS}
          />
        }
      >
        <TasksQueryProvider>
          <WorkspaceParts filterFields={TASK_FILTER_FIELDS}>
            <TasksView />
          </WorkspaceParts>
        </TasksQueryProvider>
      </Suspense>
      <footer className="workspace-foot">
        <ByKikstart />
      </footer>
    </div>
  );
}
