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

export interface RangeInput {
  min: string | null;
  max: string | null;
  preset?: string;
  exclude?: boolean;
  minExclusive?: boolean;
  maxExclusive?: boolean;
}

export interface RangeState extends RangeInput {
  field: string;
}

export const TEXT_OPS = [
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "not_equals",
] as const;

export type TextOp = (typeof TEXT_OPS)[number];

export interface TextState {
  field: string;
  op: TextOp;
  value: string;
}

export type MatchMode = "all" | "any";

export interface QueryState {
  equals: Record<string, string[]>;
  ranges: RangeState[];
  texts: TextState[];
  overlaps: Record<string, string[]>;
  match: MatchMode;
  search: string | null;
  sort: SortState;
  group: string | null;
  cursor: string | null;
}

export interface DataSourceCapabilities {
  holdsAllRows: boolean;
  searchIsOrdered: boolean;
  facetCountsFollowFilters: boolean;
  narrowLimited: boolean;
  matchAny: boolean;
  canRun: (query: QueryState) => boolean;
  isNarrowed: (query: QueryState) => boolean;
  narrowBasis: (query: QueryState) => string;
  equalsFields: string[];
  rangeFields: string[];
  textFields: string[];
  overlapFields: string[];
  groupFields: string[];
  sortFields: string[];
  searchFields: string[];
  isFacetCountExact: (query: QueryState) => boolean;
}

export interface SizeResult {
  rows: number;
  over: boolean;
  capped: boolean;
}

export interface NarrowedResult {
  limit: number;
  all: SizeResult;
  any: SizeResult | null;
}

export interface NarrowedState extends NarrowedResult {
  allBasis: string;
  anyBasis: string;
}

export interface OfferContext {
  capabilities: DataSourceCapabilities;
  allSearchMatchesLoaded: boolean;
  narrowed?: NarrowedState | null;
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

export function getRange(query: QueryState, key: string): RangeState | null {
  return query.ranges.find((range) => range.field === key) ?? null;
}

export function listRanges(query: QueryState, key: string): RangeState[] {
  return query.ranges.filter((range) => range.field === key);
}

export function getFieldLabel(def: BaseGridDef, key: string): string {
  return getField(def, key)?.label ?? key;
}

export type FilterKind = "lookup" | "equals" | "range" | "overlap";

export function hasFixedValues(field: BaseFieldDef): boolean {
  return field.options !== undefined || field.type === "boolean";
}

export const TEXT_MAX_LENGTH = 80;
export const TEXT_FILTER_MAX = 8;
export const RANGE_FILTER_MAX = 12;

export function resolveFilterKind(
  field: BaseFieldDef,
  capabilities: DataSourceCapabilities,
): FilterKind | null {
  if (capabilities.equalsFields.includes(field.key)) {
    return hasFixedValues(field) ? "equals" : "lookup";
  }
  if (capabilities.rangeFields.includes(field.key)) {
    return "range";
  }
  if (capabilities.overlapFields.includes(field.key)) {
    return "overlap";
  }
  return null;
}

export function listFilterFields<F extends BaseFieldDef>(
  def: BaseGridDef<F>,
  capabilities: DataSourceCapabilities,
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
