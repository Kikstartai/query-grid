export type FieldType =
  | "id"
  | "text"
  | "enum"
  | "integer"
  | "money"
  | "datetime";

export type FilterOperator = "eq" | "range";

export type SortDirection = "asc" | "desc";

export type QueryMode = "server" | "memory";

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
  maxValues?: number;
  width?: number;
  pinned?: boolean;
  hidden?: boolean;
  wrap?: boolean;
}

export interface FacetDef {
  field: string;
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

export interface GridDef<F extends FieldDef = FieldDef> {
  id: string;
  fields: F[];
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
  equals: Record<string, string[]>;
  range: RangeState | null;
  quick: string | null;
  sort: SortState;
  cursor: string | null;
}

export interface Capabilities {
  mode: QueryMode;
  isAnswerable: (query: QueryState) => boolean;
  sortFields: string[];
  quickFields: string[];
  isFacetCountShown: (query: QueryState) => boolean;
}

export interface QueryRules {
  capabilities: Capabilities;
  quickComplete: boolean;
}

export const KEY_FIELD = "id";
export const DEFAULT_MAX_VALUES = 20;

export function getField<F extends FieldDef>(
  def: GridDef<F>,
  key: string,
): F | null {
  return def.fields.find((field) => field.key === key) ?? null;
}

export function getFieldLabel(def: GridDef, key: string): string {
  return getField(def, key)?.label ?? key;
}

export function listFilterFields<F extends FieldDef>(def: GridDef<F>): F[] {
  return def.fields.filter((field) => field.operators.length > 0);
}

export function isDefaultSort(def: GridDef, sort: SortState): boolean {
  return (
    sort.field === def.defaultSort.field &&
    sort.direction === def.defaultSort.direction
  );
}

export function resolveMaxValues(field: FieldDef): number {
  return field.maxValues ?? DEFAULT_MAX_VALUES;
}
