"use client";

import { useState } from "react";

import { encodeQuery, type GridRow } from "@kikstart/query-grid";
import {
  useQueryGridActions,
  useRowSelection,
  type RowSelection,
} from "@kikstart/query-grid-react";
import type { GridDef } from "@kikstart/query-grid-react/components";
import { DataGrid, ExportButton } from "@kikstart/query-grid-react/ui";
import { Button } from "@ui-sdk/react/button";
import { MenuItem } from "@ui-sdk/react/menu";

interface DemoGridProps {
  def: GridDef;
  labelField: string;
}

interface BulkActionProps {
  def: GridDef;
  onDone: (note: string) => void;
}

function describeSelection(def: GridDef, selection: RowSelection): string {
  if (selection.kind === "rows") {
    return `Bulk action on ${selection.ids.length} rows by id`;
  }
  if (selection.kind === "matching") {
    const filters = encodeQuery(def, selection.query).toString();
    return `Bulk action on every row matching "${filters}"`;
  }
  return "Nothing selected";
}

function BulkAction({ def, onDone }: BulkActionProps) {
  const selection = useRowSelection();
  const { clearSelection } = useQueryGridActions();
  return (
    <Button
      data-bulk-action
      data-selection-kind={selection.kind}
      onClick={() => {
        onDone(describeSelection(def, selection));
        clearSelection();
      }}
    >
      Bulk action
    </Button>
  );
}

function RowMenuItems() {
  return (
    <>
      <MenuItem value="open">Open</MenuItem>
      <MenuItem value="duplicate">Duplicate</MenuItem>
    </>
  );
}

export function DemoGrid({ def, labelField }: DemoGridProps) {
  const [note, setNote] = useState("");
  const labelOf = (row: GridRow) => String(row[labelField] ?? row.id);
  return (
    <DataGrid.Root
      rowLabel={labelOf}
      onRowOpen={(row) => setNote(`Opened ${labelOf(row)}`)}
      rowActions={RowMenuItems}
      onRowAction={(value, row) => setNote(`${value}: ${labelOf(row)}`)}
    >
      <DataGrid.Toolbar>
        <DataGrid.Status />
        <output className="grid-note" data-grid-note>
          {note}
        </output>
        <ExportButton />
        <DataGrid.ColumnsMenu />
      </DataGrid.Toolbar>
      <DataGrid.Selection>
        <BulkAction def={def} onDone={setNote} />
      </DataGrid.Selection>
      <DataGrid.Body />
    </DataGrid.Root>
  );
}
