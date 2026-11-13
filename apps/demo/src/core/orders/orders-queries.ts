import {
  isValidFieldValue,
  KEY_FIELD,
  type CountResult,
  type FacetCount,
  type FieldOption,
  type GridRow,
  type OptionSearch,
  type PageResult,
  type QueryState,
  type TotalResult,
} from "@kikstart/query-grid";
import {
  buildRowSql,
  getGridCount,
  getGridTotal,
  listFacetCounts,
  listGridPage,
  QueryRejected,
} from "@kikstart/query-grid/server";

import { executeSql } from "@/lib/db";

import { ORDERS_GRID } from "./orders-grid-def";

const STATUS_FIELD = "status_code";
const CUSTOMER_FIELD = "customer_id";
const OPTION_LIMIT = 20;
const OPTION_QUERY_MAX = 80;
const OPTION_SELECT =
  "SELECT c.id AS value, c.name || ' #' || c.seq AS label FROM customers c";

export function listOrdersPage(
  query: QueryState,
  limit: number,
): Promise<PageResult> {
  return listGridPage(ORDERS_GRID, executeSql, query, limit);
}

export function getOrdersCount(
  query: QueryState,
  exact: boolean,
): Promise<CountResult> {
  return getGridCount(ORDERS_GRID, executeSql, query, exact);
}

export function getOrdersTotal(query: QueryState): Promise<TotalResult> {
  return getGridTotal(ORDERS_GRID, executeSql, query);
}

export function listStatusCounts(): Promise<FacetCount[]> {
  return listFacetCounts(ORDERS_GRID, executeSql);
}

export async function listOrderOptions(
  field: string,
  search: OptionSearch,
): Promise<FieldOption[]> {
  if (field !== CUSTOMER_FIELD) {
    throw new QueryRejected("invalid_value", `${field} has no option lookup`);
  }
  if (search.value !== undefined) {
    if (!isValidFieldValue(ORDERS_GRID, CUSTOMER_FIELD, search.value)) {
      throw new QueryRejected("invalid_value", "unknown customer");
    }
    return executeSql<FieldOption>({
      text: `${OPTION_SELECT} WHERE c.id = $1::uuid`,
      values: [search.value],
    });
  }
  const text = (search.query ?? "").trim().slice(0, OPTION_QUERY_MAX);
  if (text.length < 2) {
    return executeSql<FieldOption>({
      text: `${OPTION_SELECT} ORDER BY c.seq LIMIT ${OPTION_LIMIT}`,
      values: [],
    });
  }
  const pattern = `%${text.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
  return executeSql<FieldOption>({
    text: `${OPTION_SELECT} WHERE c.name ILIKE $1 ORDER BY c.seq LIMIT ${OPTION_LIMIT}`,
    values: [pattern],
  });
}

export async function listStatusTransitions(): Promise<[string, string][]> {
  const rows = await executeSql<{ from_code: string; to_code: string }>({
    text: "SELECT from_code, to_code FROM order_status_transitions ORDER BY from_code, to_code",
    values: [],
  });
  return rows.map((row) => [row.from_code, row.to_code]);
}

export async function changeOrderStatus(
  id: string,
  to: string,
): Promise<GridRow> {
  const valid =
    isValidFieldValue(ORDERS_GRID, KEY_FIELD, id) &&
    isValidFieldValue(ORDERS_GRID, STATUS_FIELD, to);
  if (!valid) {
    throw new QueryRejected("invalid_value", "unknown order or status");
  }
  const updated = await executeSql<{ id: string }>({
    text: `UPDATE orders t SET status_code = $2, updated_at = now()
           WHERE t.id = $1::uuid
             AND EXISTS (
               SELECT 1 FROM order_status_transitions x
               WHERE x.from_code = t.status_code AND x.to_code = $2
             )
           RETURNING t.id`,
    values: [id, to],
  });
  if (updated.length === 0) {
    throw new QueryRejected(
      "transition_refused",
      `the transitions table does not allow a move to ${to}`,
    );
  }
  const [row] = await executeSql<GridRow>(buildRowSql(ORDERS_GRID, id));
  return row;
}
