import {
  getField,
  hasFixedValues,
  type BaseFieldDef,
  type BaseGridDef,
} from "./grid-def.ts";
import type { QueryState } from "./query-state.ts";

export interface DataSourceCapabilities {
  holdsAllRows: boolean;
  searchIsOrdered: boolean;
  facetCountsFollowFilters: boolean;
  narrowLimited: boolean;
  combineOr: boolean;
  canRun: (query: QueryState) => boolean;
  isNarrowed: (query: QueryState) => boolean;
  narrowBasis: (query: QueryState) => string;
  equalsFields: string[];
  rangeFields: string[];
  textFields: string[];
  overlapFields: string[];
  groupFields: string[];
  sortFields: string[];
  thenByFields: string[];
  sortOrders: string[][];
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
  and: SizeResult;
  or: SizeResult | null;
}

export interface NarrowedState extends NarrowedResult {
  andBasis: string;
  orBasis: string;
}

export interface OfferContext {
  capabilities: DataSourceCapabilities;
  allSearchMatchesLoaded: boolean;
  narrowed?: NarrowedState | null;
}

export type FilterKind = "lookup" | "equals" | "range" | "overlap";

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
