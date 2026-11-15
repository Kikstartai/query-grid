import type { FacetDef, IndexedGridDef } from "@kikstart/query-grid";

export interface FacetStorage extends FacetDef {
  counterTable: string;
}

export interface PostgresGridDef extends IndexedGridDef {
  table: string;
  facet?: FacetStorage;
}
