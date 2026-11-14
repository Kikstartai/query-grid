import type { FacetDef, GridDef } from "@kikstart/query-grid";

export interface OrderedShape {
  equals: string[];
  sort: string;
  range?: boolean;
  multi?: boolean;
}

export interface QuickShape {
  quick: string[];
}

export type QueryShape = OrderedShape | QuickShape;

export interface FacetStorage extends FacetDef {
  counterTable: string;
}

export interface ServerGridDef extends GridDef {
  table: string;
  shapes: QueryShape[];
  facet?: FacetStorage;
}
