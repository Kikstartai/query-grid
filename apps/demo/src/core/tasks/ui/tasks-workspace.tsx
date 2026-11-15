import { Suspense } from "react";

import { AtRequest } from "@/lib/at-request";
import { ByKikstart, SiteBrand } from "@/lib/site-brand";
import { WorkspaceParts } from "@/lib/workspace-parts";
import { WorkspaceSkeleton } from "@/lib/workspace-skeleton";

import { TASK_COUNT, TASKS_GRID_DEF } from "../tasks-grid-def";
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
      <Suspense fallback={<WorkspaceSkeleton def={TASKS_GRID_DEF} />}>
        <AtRequest>
          <TasksQueryProvider>
            <WorkspaceParts>
              <TasksView />
            </WorkspaceParts>
          </TasksQueryProvider>
        </AtRequest>
      </Suspense>
      <footer className="workspace-foot">
        <ByKikstart />
      </footer>
    </div>
  );
}
