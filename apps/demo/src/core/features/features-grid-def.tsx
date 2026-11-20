import {
  createLinkCell,
  type GridDef,
} from "@kikstart/query-grid-react/components";

import { TASKS_GRID_DEF } from "../tasks/tasks-grid-def";

export const FEATURES_ORDER_FIELD = "rank";

const assigneeLink = createLinkCell((value) =>
  value === null
    ? null
    : `/memory?f.assignee.any_of=${encodeURIComponent(String(value))}`,
);

export const FEATURES_GRID_DEF: GridDef = {
  ...TASKS_GRID_DEF,
  id: "features",
  defaultSort: { field: FEATURES_ORDER_FIELD, direction: "asc" },
  fields: TASKS_GRID_DEF.fields.map((field) =>
    field.key === "assignee" ? { ...field, cell: assigneeLink } : field,
  ),
};
