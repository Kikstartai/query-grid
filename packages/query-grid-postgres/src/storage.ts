import type { FacetDef, ShapedGridDef } from "@kikstart/query-grid";

export interface FacetStorage extends FacetDef {
  counterTable: string;
}

export interface PostgresGridDef extends ShapedGridDef {
  table: string;
  facet?: FacetStorage;
}
