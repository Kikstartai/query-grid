import type { BaseGridDef, GridRow } from "@kikstart/query-grid";

import type { FieldDef } from "./fields.ts";

export const TEST_FIELDS: FieldDef[] = [
  { key: "id", label: "ID", type: "id" },
  { key: "number", label: "Number", type: "integer" },
  {
    key: "created_at",
    label: "Created",
    type: "datetime",
  },
  { key: "total", label: "Total", type: "money" },
  {
    key: "status",
    label: "Status",
    type: "enum",
    options: [
      { value: "open", label: "Open" },
      { value: "done", label: "Done" },
    ],
  },
  {
    key: "region",
    label: "Region",
    type: "enum",
    options: [
      { value: "north", label: "North" },
      { value: "south", label: "South" },
    ],
  },
  { key: "name", label: "Name", type: "text" },
  { key: "note", label: "Note", type: "text", nullable: true },
];

export const TEST_ROWS: GridRow[] = Array.from({ length: 6 }, (_, index) => ({
  id: `row-${index}`,
  number: 1000 + index,
  created_at: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
  total: (index + 1) * 100,
  status: index % 2 === 0 ? "open" : "done",
  region: index % 3 === 0 ? "north" : "south",
  name: `Name ${index}`,
  note: null,
}));

export const TEST_GRID_DEF: BaseGridDef = {
  id: "things",
  fields: TEST_FIELDS,
  defaultSort: { field: "created_at", direction: "desc" },
  facet: { field: "status" },
  search: ["name"],
};
