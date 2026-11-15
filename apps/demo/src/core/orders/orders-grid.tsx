import { formatValue } from "@kikstart/query-grid";
import type { FieldDef, GridDef } from "@kikstart/query-grid-react/components";

import { ORDERS_BASE, ORDERS_FACET_FIELD } from "./orders-def";

function withStatusBadge(field: FieldDef): FieldDef {
  if (field.key !== ORDERS_FACET_FIELD) {
    return field;
  }
  return {
    ...field,
    cell: (value) => (
      <span className="order-status" data-value={value ?? ""}>
        {formatValue(field, value)}
      </span>
    ),
  };
}

export const ORDERS_GRID: GridDef = {
  ...ORDERS_BASE,
  fields: ORDERS_BASE.fields.map(withStatusBadge),
};
