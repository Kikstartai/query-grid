import type { ServerGridDef } from "@kikstart/query-grid-postgres";

import {
  ORDERS_BASE,
  ORDERS_FACET_FIELD,
  ORDERS_SHAPES,
} from "./orders-fields";

export const ORDERS_SERVER_GRID: ServerGridDef = {
  ...ORDERS_BASE,
  table: "orders",
  shapes: ORDERS_SHAPES,
  facet: { field: ORDERS_FACET_FIELD, counterTable: "order_status_counts" },
};
