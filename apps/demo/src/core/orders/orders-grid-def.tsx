import {
  formatValue,
  type FieldOption,
  type QueryShape,
} from "@kikstart/query-grid";
import type { PostgresGridDef } from "@kikstart/query-grid-postgres";
import type { FieldDef, GridDef } from "@kikstart/query-grid-react/components";

import {
  ORDER_CHANNELS,
  ORDER_PRIORITIES,
  ORDER_REGIONS,
  ORDER_STATUSES,
  type WeightedOption,
} from "./orders-reference";

export const ORDERS_API = "/api/orders";
export const ORDERS_FACET_FIELD = "status_code";

function toOptions(options: WeightedOption[]): FieldOption[] {
  return options.map(({ value, label }) => ({ value, label }));
}

const ORDER_STATUS_FIELD: FieldDef = {
  key: ORDERS_FACET_FIELD,
  label: "Status",
  type: "enum",
  operators: ["eq"],
  options: toOptions(ORDER_STATUSES),
  width: 120,
  cell: (value) => (
    <span className="order-status" data-value={value ?? ""}>
      {formatValue(ORDER_STATUS_FIELD, value)}
    </span>
  ),
};

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
  ORDER_STATUS_FIELD,
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

const ORDER_SHAPES: QueryShape[] = [
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

export const ORDERS_GRID_DEF = {
  id: "orders",
  table: "orders",
  fields: ORDER_FIELDS,
  shapes: ORDER_SHAPES,
  defaultSort: { field: "created_at", direction: "desc" },
  facet: { field: ORDERS_FACET_FIELD, counterTable: "order_status_counts" },
  total: { field: "total" },
  format: { locale: "en-ZA", currency: "ZAR" },
} satisfies GridDef & PostgresGridDef;
