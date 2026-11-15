import type { PostgresGridDef } from "@kikstart/query-grid-postgres";

import { ORDERS_SERVER_GRID } from "./orders/orders-def";

export const SERVER_GRIDS: PostgresGridDef[] = [ORDERS_SERVER_GRID];

export function resolveMigrationFile(table: string): string {
  return `0002_query_grid_${table}.sql`;
}
