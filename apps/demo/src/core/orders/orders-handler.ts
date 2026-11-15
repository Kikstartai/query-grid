import {
  isValidFieldValue,
  type FieldOption,
  type GridRow,
  type OptionSearch,
} from "@kikstart/query-grid";
import {
  buildRowSql,
  createGridHandler,
  escapeLike,
  QueryRejected,
} from "@kikstart/query-grid-postgres";

import { executeSql } from "@/lib/db";

import {
  ORDERS_API,
  ORDERS_FACET_FIELD,
  ORDERS_SERVER_GRID,
} from "./orders-def";

const CUSTOMER_FIELD = "customer_id";
const OPTION_LIMIT = 20;
const OPTION_QUERY_MAX = 80;
const OPTION_SELECT =
  "SELECT c.id AS value, c.name || ' #' || c.seq AS label FROM customers c";

async function listOrderOptions(
  field: string,
  search: OptionSearch,
  signal: AbortSignal,
): Promise<FieldOption[]> {
  if (field !== CUSTOMER_FIELD) {
    throw new QueryRejected("invalid_value", "no_option_lookup", { field });
  }
  if (search.value !== undefined) {
    if (!isValidFieldValue(ORDERS_SERVER_GRID, CUSTOMER_FIELD, search.value)) {
      throw new QueryRejected("invalid_value", "invalid_value", { field });
    }
    return executeSql<FieldOption>(
      {
        text: `${OPTION_SELECT} WHERE c.id = $1::uuid`,
        values: [search.value],
      },
      [],
      signal,
    );
  }
  const text = (search.query ?? "").trim().slice(0, OPTION_QUERY_MAX);
  if (text.length < 2) {
    return executeSql<FieldOption>(
      {
        text: `${OPTION_SELECT} ORDER BY c.seq LIMIT ${OPTION_LIMIT}`,
        values: [],
      },
      [],
      signal,
    );
  }
  const pattern = `%${escapeLike(text)}%`;
  return executeSql<FieldOption>(
    {
      text: `${OPTION_SELECT} WHERE c.name ILIKE $1 ORDER BY c.seq LIMIT ${OPTION_LIMIT}`,
      values: [pattern],
    },
    [],
    signal,
  );
}

async function listStatusTransitions(
  signal: AbortSignal,
): Promise<[string, string][]> {
  const rows = await executeSql<{ from_code: string; to_code: string }>(
    {
      text: "SELECT from_code, to_code FROM order_status_transitions ORDER BY from_code, to_code",
      values: [],
    },
    [],
    signal,
  );
  return rows.map((row) => [row.from_code, row.to_code]);
}

async function changeOrderStatus(id: string, to: string): Promise<GridRow> {
  const updated = await executeSql<{ id: string }>({
    text: `UPDATE orders t SET ${ORDERS_FACET_FIELD} = $2, updated_at = now()
           WHERE t.id = $1::uuid
             AND EXISTS (
               SELECT 1 FROM order_status_transitions x
               WHERE x.from_code = t.${ORDERS_FACET_FIELD} AND x.to_code = $2
             )
           RETURNING t.id`,
    values: [id, to],
  });
  if (updated.length === 0) {
    throw new QueryRejected("transition_refused", "transition_refused", { to });
  }
  const [row] = await executeSql<GridRow>(buildRowSql(ORDERS_SERVER_GRID, id));
  return row;
}

export const handleOrdersRequest = createGridHandler({
  def: ORDERS_SERVER_GRID,
  execute: executeSql,
  basePath: ORDERS_API,
  options: listOrderOptions,
  moves: { transitions: listStatusTransitions, change: changeOrderStatus },
});
