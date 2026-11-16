export type FieldType =
  | "id"
  | "text"
  | "enum"
  | "integer"
  | "decimal"
  | "money"
  | "boolean"
  | "date"
  | "datetime"
  | "array";

export type SortDirection = "asc" | "desc";

export type GridValue = string | number | boolean | string[] | null;

export type GridRow = Record<string, GridValue> & { id: string };

export const FIELD_TYPES: readonly FieldType[] = [
  "id",
  "text",
  "enum",
  "integer",
  "decimal",
  "money",
  "boolean",
  "date",
  "datetime",
  "array",
];

export const FIELD_RENDERS = ["text", "badge", "list"] as const;

export type FieldRender = (typeof FIELD_RENDERS)[number];

export const FIELD_TONES = [
  "neutral",
  "info",
  "success",
  "warning",
  "danger",
] as const;

export type FieldTone = (typeof FIELD_TONES)[number];

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
  render?: FieldRender;
  tones?: Record<string, FieldTone>;
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
  orderField?: string;
}

export interface IndexDef {
  equals: string[];
  sort: string;
  range?: boolean;
  multi?: boolean;
  empty?: string[];
  then?: string[];
}

export interface IndexExtras {
  textIndexes?: string[];
  arrayIndexes?: string[];
}

export interface IndexedGridDef extends BaseGridDef, IndexExtras {
  indexes: IndexDef[];
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

export function getFieldLabel(def: BaseGridDef, key: string): string {
  return getField(def, key)?.label ?? key;
}

export function listSearchFields(def: BaseGridDef): string[] {
  return def.search ?? [];
}

export function listTotalFields<F extends BaseFieldDef>(
  def: BaseGridDef<F>,
): F[] {
  return (def.totals ?? []).flatMap((key) => getField(def, key) ?? []);
}

const RANGE_TYPES: FieldType[] = [
  "integer",
  "decimal",
  "money",
  "date",
  "datetime",
];

const DATE_TYPES: FieldType[] = ["date", "datetime"];
const NUMBER_TYPES: FieldType[] = ["integer", "decimal", "money"];

export function isRangeType(type: FieldType): boolean {
  return RANGE_TYPES.includes(type);
}

export function isDateType(type: FieldType): boolean {
  return DATE_TYPES.includes(type);
}

export function isNumberType(type: FieldType): boolean {
  return NUMBER_TYPES.includes(type);
}

export function hasFixedValues(field: BaseFieldDef): boolean {
  return field.options !== undefined || field.type === "boolean";
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
