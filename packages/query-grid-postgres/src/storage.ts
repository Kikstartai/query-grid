import type { FacetDef, BaseGridDef, QueryShape } from "@kikstart/query-grid";

export interface FacetStorage extends FacetDef {
  counterTable: string;
}

export interface PostgresGridDef extends BaseGridDef {
  table: string;
  shapes: QueryShape[];
  facet?: FacetStorage;
}
