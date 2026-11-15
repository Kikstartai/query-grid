import { formatValue } from "@kikstart/query-grid";
import type {
  ClientFieldDef,
  ClientGridDef,
} from "@kikstart/query-grid-react/components";

import { ORDERS_BASE, ORDERS_FACET_FIELD } from "./orders-def";

function withStatusBadge(field: ClientFieldDef): ClientFieldDef {
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

export const ORDERS_GRID: ClientGridDef = {
  ...ORDERS_BASE,
  fields: ORDERS_BASE.fields.map(withStatusBadge),
};
