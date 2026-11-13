"use client";

import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";

import { GRID_VIEWS, type GridView } from "../model/query-store.ts";
import { useGridView, useQueryGrid } from "../react/query-grid-provider.tsx";

export interface ViewOption {
  view: GridView;
  label: string;
}

interface ViewSwitchProps {
  views: ViewOption[];
}

export function ViewSwitch({ views }: ViewSwitchProps) {
  const { store } = useQueryGrid();
  const current = useGridView();
  return (
    <SegmentedControl
      className="qg-view-switch"
      aria-label="View"
      data-part="view-switch"
      value={current}
      onValueChange={(value: string | null) => {
        const next = GRID_VIEWS.find((view) => view === value);
        if (next) {
          store.setView(next);
        }
      }}
    >
      <SegmentedControlIndicator className="qg-view-indicator" />
      {views.map(({ view, label }) => (
        <SegmentedControlItem
          key={view}
          className="qg-view-item"
          value={view}
          data-view={view}
        >
          {label}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}
