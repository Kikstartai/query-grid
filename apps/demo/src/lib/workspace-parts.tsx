import type { ReactNode } from "react";

import {
  CountDisplay,
  FacetPanel,
  FilterBar,
  FilterChips,
  FilterSidebar,
  TotalFooter,
  ViewSwitch,
} from "@kikstart/query-grid-react/ui";

import { VIEWS } from "./site";

interface WorkspacePartsProps {
  children: ReactNode;
}

export function WorkspaceParts({ children }: WorkspacePartsProps) {
  return (
    <>
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
          {children}
        </div>
      </div>
      <div className="workspace-total">
        <TotalFooter />
      </div>
    </>
  );
}
