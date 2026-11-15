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
  filterFields?: string[];
  barFields?: string[];
  containsFields?: string[];
  children: ReactNode;
}

export function WorkspaceParts({
  filterFields,
  barFields,
  containsFields,
  children,
}: WorkspacePartsProps) {
  return (
    <>
      <div className="workspace-tools">
        <CountDisplay />
        <span className="workspace-spacer" />
        <ViewSwitch views={VIEWS} />
      </div>
      <div className="workspace-body">
        <FilterBar
          fields={barFields ?? filterFields}
          contains={containsFields}
        />
        <div className="workspace-chips">
          <FilterSidebar fields={filterFields} contains={containsFields} />
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
