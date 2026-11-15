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

export interface BaseGridDef<F extends BaseFieldDef = BaseFieldDef> {
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
  equalsFields: string[];
  rangeFields: string[];
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

const RANGE_TYPES: FieldType[] = ["integer", "money", "datetime"];

export function isRangeType(type: FieldType): boolean {
  return RANGE_TYPES.includes(type);
}

export function isLookupField(field: BaseFieldDef): boolean {
  return !field.options;
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
    return isLookupField(field) ? "lookup" : "equals";
  }
  if (capabilities.rangeFields.includes(field.key)) {
    return "range";
  }
  return null;
}

export function listFilterFields<F extends BaseFieldDef>(
  def: BaseGridDef<F>,
  capabilities: Capabilities,
): F[] {
  return def.fields.filter(
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
