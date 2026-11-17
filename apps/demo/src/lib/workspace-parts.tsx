import type { ReactNode } from "react";

import {
  CountDisplay,
  FacetPanel,
  FilterBar,
  FilterChips,
  FilterSidebar,
  TotalFooter,
  ViewSwitch,
  type ViewOption,
} from "@kikstart/query-grid-react/ui";

import { PhoneDefaultView } from "./phone-view";
import { VIEWS } from "./site";

interface WorkspacePartsProps {
  filterFields?: string[];
  barFields?: string[];
  textFields?: string[];
  views?: ViewOption[];
  children: ReactNode;
}

export function WorkspaceParts({
  filterFields,
  barFields,
  textFields,
  views = VIEWS,
  children,
}: WorkspacePartsProps) {
  return (
    <>
      <PhoneDefaultView />
      <div className="workspace-tools">
        <CountDisplay />
        <span className="workspace-spacer" />
        <ViewSwitch views={views} />
      </div>
      <div className="workspace-body">
        <FilterBar fields={barFields ?? filterFields} texts={textFields} />
        <div className="workspace-chips">
          <FilterSidebar fields={filterFields} texts={textFields} />
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
