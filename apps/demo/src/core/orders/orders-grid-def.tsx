import { formatValue } from "@kikstart/query-grid";
import { capabilities } from "@kikstart/query-grid-postgres/capabilities";
import type { ClientFieldDef, ClientGridDef } from "@kikstart/query-grid-react";

import {
  ORDERS_BASE,
  ORDERS_FACET_FIELD,
  ORDERS_SHAPES,
} from "./orders-fields";

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

export const ORDERS_CAPABILITIES = capabilities(ORDERS_SHAPES, {
  facetField: ORDERS_FACET_FIELD,
});
