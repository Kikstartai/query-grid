"use client";

import { DataGrid, ExportButton } from "@kikstart/query-grid-react/ui";

import { TaskViews } from "../../tasks/ui/tasks-view";

export function LocalizedView() {
  return (
    <TaskViews>
      <DataGrid.Root>
        <DataGrid.Toolbar>
          <DataGrid.Status />
          <ExportButton />
          <DataGrid.ColumnsMenu />
        </DataGrid.Toolbar>
        <DataGrid.Selection />
        <DataGrid.Body />
      </DataGrid.Root>
    </TaskViews>
  );
}
