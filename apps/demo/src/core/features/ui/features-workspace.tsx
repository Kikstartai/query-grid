import { Suspense } from "react";

import { memoryCapabilities } from "@kikstart/query-grid/memory";

import { ByKikstart, SiteBrand } from "@/lib/site-brand";
import { WorkspaceParts } from "@/lib/workspace-parts";
import { WorkspaceSkeleton } from "@/lib/workspace-skeleton";

import { TASK_FILTER_FIELDS, TASKS_GRID_DEF } from "../../tasks/tasks-grid-def";
import { FeaturesQueryProvider, FeaturesView } from "../features-provider";
import { FeatureGuide } from "./feature-guide";

function FeaturesFallback() {
  return (
    <>
      <div className="feature-guide" aria-hidden="true" />
      <WorkspaceSkeleton
        def={TASKS_GRID_DEF}
        capabilities={memoryCapabilities(TASKS_GRID_DEF)}
        fields={TASK_FILTER_FIELDS}
      />
    </>
  );
}

export function FeaturesWorkspace() {
  return (
    <div className="workspace" data-source="memory">
      <header className="workspace-head">
        <SiteBrand />
        <h1>Grid features</h1>
      </header>
      <Suspense fallback={<FeaturesFallback />}>
        <FeaturesQueryProvider>
          <FeatureGuide />
          <WorkspaceParts filterFields={TASK_FILTER_FIELDS} phoneView={null}>
            <FeaturesView />
          </WorkspaceParts>
        </FeaturesQueryProvider>
      </Suspense>
      <footer className="workspace-foot">
        <ByKikstart />
      </footer>
    </div>
  );
}
