import type { ServerGridDef } from "@kikstart/query-grid-postgres";

import { ORDERS_SERVER_GRID } from "./orders/orders-server-def";

export const SERVER_GRIDS: ServerGridDef[] = [ORDERS_SERVER_GRID];

export function resolveMigrationFile(table: string): string {
  return `0002_query_grid_${table}.sql`;
}
