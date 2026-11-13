import type { ReactNode } from "react";

export type FieldType =
  "id" | "text" | "enum" | "integer" | "money" | "datetime";

export type FilterOperator = "eq" | "range";

export type SortDirection = "asc" | "desc";

export type QueryMode = "indexed" | "memory";

export type GridRow = Record<string, string | number | null> & { id: string };

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldLookup {
  labelField: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  operators: FilterOperator[];
  nullable?: boolean;
  options?: FieldOption[];
  lookup?: FieldLookup;
  width?: number;
  pinned?: boolean;
  hidden?: boolean;
  wrap?: boolean;
  cell?: (value: string | number | null, row: GridRow) => ReactNode;
}

export interface OrderedShape {
  equals: string[];
  sort: string;
  range?: boolean;
}

export interface QuickShape {
  quick: string[];
}

export type QueryShape = OrderedShape | QuickShape;

export interface FacetDef {
  field: string;
  counterTable: string;
}

export interface TotalDef {
  field: string;
}

export interface SortState {
  field: string;
  direction: SortDirection;
}

export interface GridFormat {
  locale?: string;
  currency?: string;
}

export interface GridDef {
  table: string;
  fields: FieldDef[];
  shapes: QueryShape[];
  defaultSort: SortState;
  facet?: FacetDef;
  total?: TotalDef;
  format?: GridFormat;
}

export interface RangeState {
  field: string;
  min: string | null;
  max: string | null;
}

export interface QueryState {
  equals: Record<string, string>;
  range: RangeState | null;
  quick: string | null;
  sort: SortState;
  cursor: string | null;
}

export interface QueryRules {
  mode: QueryMode;
  quickComplete: boolean;
}

export const KEY_FIELD = "id";

export const INDEXED_RULES: QueryRules = {
  mode: "indexed",
  quickComplete: false,
};

export function isQuickShape(shape: QueryShape): shape is QuickShape {
  return "quick" in shape;
}

export function getField(def: GridDef, key: string): FieldDef | null {
  return def.fields.find((field) => field.key === key) ?? null;
}

export function getFieldLabel(def: GridDef, key: string): string {
  return getField(def, key)?.label ?? key;
}

export function listFilterFields(def: GridDef): FieldDef[] {
  return def.fields.filter((field) => field.operators.length > 0);
}

export function isDefaultSort(def: GridDef, sort: SortState): boolean {
  return (
    sort.field === def.defaultSort.field &&
    sort.direction === def.defaultSort.direction
  );
}

export function listQuickFields(def: GridDef): string[] {
  return def.shapes.find(isQuickShape)?.quick ?? [];
}
