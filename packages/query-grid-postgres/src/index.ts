export { decodeCursor, encodeCursor, type Cursor } from "./cursor.ts";
export {
  createGridHandler,
  type GridHandler,
  type GridHandlerConfig,
  type GridMoves,
} from "./grid-handler.ts";
export {
  getGridCount,
  getNarrowedSizes,
  listFacetCounts,
  listGridGroups,
  listGridPage,
  listGridTotals,
  QUERY_CANCELED,
  listSearchSettings,
  NARROW_SETTINGS,
  TOTAL_SETTINGS,
  walkGridPages,
  type SqlExecutor,
} from "./query-runner.ts";
export {
  generateGridMigration,
  listCounterObjects,
  listGridMigrationSteps,
  listMissingIndexes,
  listIndexDdl,
  listTableMigrations,
  validateGridDefs,
  type CounterObjects,
  type MigrationOptions,
  type MigrationStep,
  type PgIndexRow,
  type IndexDdl,
  type TableMigration,
} from "./schema-ddl.ts";
export {
  describeSearch,
  describeIndex,
  validateGridDef,
} from "./index-defs.ts";
export {
  assertDeclared,
  buildCappedCountSql,
  buildCappedTotalSql,
  buildExactCountSql,
  buildFacetSql,
  buildGroupSql,
  buildPageSql,
  buildRowSql,
  escapeLike,
  IDENTIFIER_MAX_LENGTH,
  QueryRejected,
  searchExpression,
  shortenIdentifier,
  toPageResult,
  type RejectionCode,
  type SqlQuery,
  type SqlValue,
} from "./sql-builder.ts";
export type { FacetStorage, PostgresGridDef } from "./storage.ts";
