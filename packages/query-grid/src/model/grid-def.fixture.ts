import type { GridDef } from "./field-types.ts";
import type { QueryShape } from "./shapes.ts";

export const TEST_QUICK_FIELDS = ["name", "number"];

export const TEST_SHAPES: QueryShape[] = [
  { equals: [], sort: "created_at", range: true },
  { equals: [], sort: "total", range: true },
  { equals: ["status"], sort: "created_at" },
  { equals: ["status"], sort: "total", range: true },
  { equals: ["region"], sort: "created_at" },
  { quick: TEST_QUICK_FIELDS },
];

export const TEST_DEF: GridDef = {
  id: "things",
  defaultSort: { field: "created_at", direction: "desc" },
  facet: { field: "status" },
  total: { field: "total" },
  fields: [
    { key: "id", label: "ID", type: "id", operators: [] },
    { key: "number", label: "Number", type: "integer", operators: [] },
    {
      key: "created_at",
      label: "Created",
      type: "datetime",
      operators: ["range"],
    },
    { key: "total", label: "Total", type: "money", operators: ["range"] },
    {
      key: "status",
      label: "Status",
      type: "enum",
      operators: ["eq"],
      options: [
        { value: "open", label: "Open" },
        { value: "done", label: "Done" },
      ],
    },
    {
      key: "region",
      label: "Region",
      type: "enum",
      operators: ["eq"],
      options: [
        { value: "north", label: "North" },
        { value: "south", label: "South" },
      ],
    },
    { key: "name", label: "Name", type: "text", operators: [] },
    {
      key: "note",
      label: "Note",
      type: "text",
      operators: [],
      nullable: true,
    },
  ],
};
