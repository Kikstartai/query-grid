import {
  shapeCapabilities,
  type FieldDef,
  type FieldOption,
  type GridDef,
  type QueryShape,
} from "@kikstart/query-grid";
import type { ServerGridDef } from "@kikstart/query-grid-postgres";

import {
  ORDER_CHANNELS,
  ORDER_PRIORITIES,
  ORDER_REGIONS,
  ORDER_STATUSES,
  type WeightedOption,
} from "./orders-reference";

function toOptions(options: WeightedOption[]): FieldOption[] {
  return options.map(({ value, label }) => ({ value, label }));
}

const ORDER_FIELDS: FieldDef[] = [
  {
    key: "order_number",
    label: "Order",
    type: "integer",
    operators: [],
    width: 110,
    pinned: true,
  },
  {
    key: "created_at",
    label: "Created",
    type: "datetime",
    operators: ["range"],
    width: 170,
  },
  {
    key: "status_code",
    label: "Status",
    type: "enum",
    operators: ["eq"],
    options: toOptions(ORDER_STATUSES),
    width: 120,
  },
  {
    key: "customer_name",
    label: "Customer",
    type: "text",
    operators: [],
    width: 200,
  },
  {
    key: "total",
    label: "Total",
    type: "money",
    operators: ["range"],
    width: 120,
  },
  {
    key: "region",
    label: "Region",
    type: "enum",
    operators: ["eq"],
    options: toOptions(ORDER_REGIONS),
    width: 150,
  },
  {
    key: "channel",
    label: "Channel",
    type: "enum",
    operators: ["eq"],
    options: toOptions(ORDER_CHANNELS),
    width: 120,
  },
  {
    key: "item_count",
    label: "Items",
    type: "integer",
    operators: [],
    width: 80,
  },
  {
    key: "currency",
    label: "Currency",
    type: "text",
    operators: [],
    width: 90,
  },
  {
    key: "priority",
    label: "Priority",
    type: "enum",
    operators: [],
    options: toOptions(ORDER_PRIORITIES),
    width: 100,
  },
  {
    key: "paid_at",
    label: "Paid",
    type: "datetime",
    operators: [],
    nullable: true,
    width: 170,
  },
  {
    key: "shipped_at",
    label: "Shipped",
    type: "datetime",
    operators: [],
    nullable: true,
    width: 170,
  },
  {
    key: "note",
    label: "Note",
    type: "text",
    operators: [],
    nullable: true,
    width: 260,
    wrap: true,
  },
  {
    key: "updated_at",
    label: "Updated",
    type: "datetime",
    operators: [],
    width: 170,
  },
  {
    key: "customer_id",
    label: "Customer account",
    type: "id",
    operators: ["eq"],
    lookup: { labelField: "customer_name" },
    width: 300,
    hidden: true,
  },
  {
    key: "id",
    label: "ID",
    type: "id",
    operators: [],
    width: 300,
    hidden: true,
  },
];

export const ORDERS_API = "/api/orders";
export const ORDERS_FACET_FIELD = "status_code";

export const ORDERS_BASE: GridDef = {
  id: "orders",
  defaultSort: { field: "created_at", direction: "desc" },
  facet: { field: ORDERS_FACET_FIELD },
  total: { field: "total" },
  format: { locale: "en-ZA", currency: "ZAR" },
  fields: ORDER_FIELDS,
};

export const ORDERS_SHAPES: QueryShape[] = [
  { equals: [], sort: "created_at", range: true },
  { equals: [], sort: "total", range: true },
  { equals: ["status_code"], sort: "created_at", range: true },
  { equals: ["status_code"], sort: "total", range: true },
  { equals: ["customer_id"], sort: "created_at" },
  { equals: ["region"], sort: "created_at", range: true },
  { equals: ["channel"], sort: "created_at" },
  { equals: ["status_code", "region"], sort: "created_at" },
  { equals: ["status_code", "channel"], sort: "created_at" },
  { quick: ["customer_name", "order_number"] },
];

export const ORDERS_SERVER_GRID: ServerGridDef = {
  ...ORDERS_BASE,
  table: "orders",
  shapes: ORDERS_SHAPES,
  facet: { field: ORDERS_FACET_FIELD, counterTable: "order_status_counts" },
};

export const ORDERS_CAPABILITIES = shapeCapabilities(ORDERS_SHAPES, {
  facetField: ORDERS_FACET_FIELD,
});
