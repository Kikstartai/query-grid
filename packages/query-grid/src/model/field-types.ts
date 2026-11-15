export type FieldType =
  | "id"
  | "text"
  | "enum"
  | "integer"
  | "money"
  | "datetime";

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

export interface BaseFieldDef {
  key: string;
  label: string;
  type: FieldType;
  nullable?: boolean;
  options?: FieldOption[];
  lookup?: FieldLookup;
  maxValues?: number;
  currency?: string;
  width?: number;
  pinned?: boolean;
  hidden?: boolean;
  wrap?: boolean;
}

export interface FacetDef {
  field: string;
}

export interface SortState {
  field: string;
  direction: SortDirection;
}

export interface BaseGridDef<F extends BaseFieldDef = BaseFieldDef> {
  id: string;
  fields: F[];
  defaultSort: SortState;
  facet?: FacetDef;
  totals?: string[];
  search?: string[];
}

export interface RangeState {
  field: string;
  min: string | null;
  max: string | null;
}

export interface QueryState {
  equals: Record<string, string[]>;
  range: RangeState | null;
  search: string | null;
  sort: SortState;
  cursor: string | null;
}

export interface Capabilities {
  mode: QueryMode;
  isAnswerable: (query: QueryState) => boolean;
  equalsFields: string[];
  rangeFields: string[];
  sortFields: string[];
  searchFields: string[];
  isFacetCountShown: (query: QueryState) => boolean;
}

export interface QueryRules {
  capabilities: Capabilities;
  searchComplete: boolean;
}

export const KEY_FIELD = "id";
export const DEFAULT_MAX_VALUES = 20;

export function getField<F extends BaseFieldDef>(
  def: BaseGridDef<F>,
  key: string,
): F | null {
  return def.fields.find((field) => field.key === key) ?? null;
}

export function getFacetField<F extends BaseFieldDef>(
  def: BaseGridDef<F>,
): F | null {
  return def.facet ? getField(def, def.facet.field) : null;
}

export function listSearchFields(def: BaseGridDef): string[] {
  return def.search ?? [];
}

export function listTotalFields<F extends BaseFieldDef>(
  def: BaseGridDef<F>,
): F[] {
  return (def.totals ?? []).flatMap((key) => getField(def, key) ?? []);
}

const RANGE_TYPES: FieldType[] = ["integer", "money", "datetime"];

export function isRangeType(type: FieldType): boolean {
  return RANGE_TYPES.includes(type);
}

export function getFieldLabel(def: BaseGridDef, key: string): string {
  return getField(def, key)?.label ?? key;
}

export type FilterKind = "lookup" | "equals" | "range";

export function resolveFilterKind(
  field: BaseFieldDef,
  capabilities: Capabilities,
): FilterKind | null {
  if (capabilities.equalsFields.includes(field.key)) {
    return field.options ? "equals" : "lookup";
  }
  if (capabilities.rangeFields.includes(field.key)) {
    return "range";
  }
  return null;
}

export function listFilterFields<F extends BaseFieldDef>(
  def: BaseGridDef<F>,
  capabilities: Capabilities,
  keys?: string[],
): F[] {
  const fields = keys
    ? keys.flatMap((key) => getField(def, key) ?? [])
    : def.fields;
  return fields.filter(
    (field) => resolveFilterKind(field, capabilities) !== null,
  );
}

export function isDefaultSort(def: BaseGridDef, sort: SortState): boolean {
  return (
    sort.field === def.defaultSort.field &&
    sort.direction === def.defaultSort.direction
  );
}

export function resolveMaxValues(field: BaseFieldDef): number {
  return field.maxValues ?? DEFAULT_MAX_VALUES;
}
