import { getField, type BaseFieldDef, type BaseGridDef } from "./grid-def.ts";
import type { FilterOp } from "./operators.ts";
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
  filterOps: Record<string, FilterOp[]>;
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

export function listCapableOps(
  capabilities: DataSourceCapabilities,
  key: string,
): FilterOp[] {
  return Object.hasOwn(capabilities.filterOps, key)
    ? capabilities.filterOps[key]
    : [];
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
    (field) => listCapableOps(capabilities, field.key).length > 0,
  );
}
