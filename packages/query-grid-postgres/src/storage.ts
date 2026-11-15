import type { FacetDef, GridDef, QueryShape } from "@kikstart/query-grid";

export interface FacetStorage extends FacetDef {
  counterTable: string;
}

export interface ServerGridDef extends GridDef {
  table: string;
  shapes: QueryShape[];
  facet?: FacetStorage;
}
