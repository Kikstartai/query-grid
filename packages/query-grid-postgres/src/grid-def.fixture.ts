import type { PostgresGridDef } from "./storage.ts";

export const TEST_DEF: PostgresGridDef = {
  id: "things",
  table: "things",
  defaultSort: { field: "created_at", direction: "desc" },
  facet: { field: "status", counterTable: "thing_status_counts" },
  total: { field: "total" },
  fields: [
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
    {
      key: "note",
      label: "Note",
      type: "text",
      nullable: true,
    },
  ],
  shapes: [
    { equals: [], sort: "created_at", range: true },
    { equals: [], sort: "total", range: true },
    { equals: ["status"], sort: "created_at" },
    { equals: ["status"], sort: "total", range: true },
    { equals: ["region"], sort: "created_at" },
    { quick: ["name", "number"] },
  ],
};
