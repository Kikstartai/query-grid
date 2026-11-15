import type { PostgresGridDef } from "@kikstart/query-grid-postgres";

import { ORDERS_GRID_DEF } from "./orders/orders-grid-def";

export const GRID_DEFS: PostgresGridDef[] = [ORDERS_GRID_DEF];

export function resolveMigrationFile(table: string): string {
  return `0002_query_grid_${table}.sql`;
}
