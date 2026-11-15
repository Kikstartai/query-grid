import {
  isRangeType,
  listSearchFields,
  type BaseFieldDef,
  type BaseGridDef,
  type QueryState,
  type RunnableQueries,
} from "./field-types.ts";
import { EMPTY_VALUE, NOT_EMPTY_VALUE } from "./field-values.ts";

export interface IndexDef {
  equals: string[];
  sort: string;
  range?: boolean;
  multi?: boolean;
}

export interface IndexedGridDef extends BaseGridDef {
  indexes: IndexDef[];
}

export interface IndexRunnableOptions {
  facetField?: string;
  searchFields?: string[];
  fields?: BaseFieldDef[];
}

const GROUP_PROBE = ["x"];

export interface QueryPlan {
  core: QueryState;
  narrowed: boolean;
  terms: QueryState[] | null;
}

export function indexId(index: IndexDef): string {
  return `${[...index.equals].sort().join("+")}|${index.sort}`;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function listEqualsFields(indexes: IndexDef[]): string[] {
  return [...new Set(indexes.flatMap((index) => index.equals))];
}

function listRangeFields(indexes: IndexDef[]): string[] {
  return [
    ...new Set(
      indexes.filter((index) => index.range).map((index) => index.sort),
    ),
  ];
}

export function listSortFields(indexes: IndexDef[]): string[] {
  return [...new Set(indexes.map((index) => index.sort))];
}

export function listNarrowRangeFields(fields: BaseFieldDef[]): string[] {
  return fields
    .filter((field) => isRangeType(field.type) && !field.options)
    .map((field) => field.key);
}

export function isGroupField(field: BaseFieldDef): boolean {
  return field.type !== "id" || field.lookup !== undefined;
}

export function listGroupFields(
  fields: BaseFieldDef[],
  equalsFields: string[],
): string[] {
  return fields
    .filter((field) => equalsFields.includes(field.key) && isGroupField(field))
    .map((field) => field.key);
}

export function isContainsField(field: BaseFieldDef): boolean {
  return field.type === "text" && !field.options;
}

export function listContainsFields(fields: BaseFieldDef[]): string[] {
  return fields.filter(isContainsField).map((field) => field.key);
}

export function listContainsFilterFields(
  runnable: RunnableQueries,
  keys?: string[],
): string[] {
  return runnable.containsFields.filter(
    (key) => keys === undefined || keys.includes(key),
  );
}

export function countFilterTerms(query: QueryState): number {
  return (
    Object.keys(query.equals).length +
    query.ranges.length +
    (query.contains ? 1 : 0)
  );
}

export function isMatchAny(query: QueryState): boolean {
  return query.match === "any" && countFilterTerms(query) > 1;
}

function hasNarrowParts(query: QueryState): boolean {
  return query.contains !== null || isMatchAny(query);
}

export function getIndex(
  indexes: IndexDef[],
  query: QueryState,
): IndexDef | null {
  const equals = Object.keys(query.equals);
  if (query.search !== null || hasNarrowParts(query)) {
    return null;
  }
  const ordered = indexes.find(
    (index) => index.sort === query.sort.field && sameSet(index.equals, equals),
  );
  if (!ordered) {
    return null;
  }
  const [range] = query.ranges;
  if (query.ranges.length > 1) {
    return null;
  }
  if (range && (!ordered.range || range.field !== ordered.sort)) {
    return null;
  }
  const several = Object.values(query.equals).some(
    (values) => values.length > 1,
  );
  return several && ordered.multi === false ? null : ordered;
}

export function isQueryIndexed(
  indexes: IndexDef[],
  searchFields: string[],
  query: QueryState,
): boolean {
  if (query.search === null) {
    return getIndex(indexes, query) !== null;
  }
  const equalsFields = listEqualsFields(indexes);
  return (
    searchFields.length > 0 &&
    !hasNarrowParts(query) &&
    Object.keys(query.equals).every((key) => equalsFields.includes(key)) &&
    query.ranges.length === 0 &&
    listSortFields(indexes).includes(query.sort.field)
  );
}

function bare(query: QueryState): QueryState {
  return {
    ...query,
    equals: {},
    ranges: [],
    contains: null,
    match: "all",
    group: null,
    cursor: null,
  };
}

function listTerms(indexes: IndexDef[], query: QueryState): QueryState[] {
  const base = bare(query);
  const terms: QueryState[] = [];
  for (const [key, values] of Object.entries(query.equals)) {
    const index = indexes.find((item) => sameSet(item.equals, [key]));
    terms.push({
      ...base,
      equals: { [key]: values },
      sort: { ...base.sort, field: index?.sort ?? base.sort.field },
    });
  }
  for (const range of query.ranges) {
    terms.push({
      ...base,
      ranges: [range],
      sort: { ...base.sort, field: range.field },
    });
  }
  return terms;
}

function planAny(indexes: IndexDef[], query: QueryState): QueryPlan | null {
  if (!listSortFields(indexes).includes(query.sort.field)) {
    return null;
  }
  const terms = listTerms(indexes, query);
  const countable =
    query.contains === null &&
    terms.every((term) => getIndex(indexes, term) !== null);
  return { core: bare(query), narrowed: true, terms: countable ? terms : null };
}

function planAll(indexes: IndexDef[], query: QueryState): QueryPlan | null {
  const base: QueryState = {
    ...query,
    contains: null,
    match: "all",
    group: null,
  };
  const onSort = query.ranges.filter(
    (range) => range.field === query.sort.field,
  );
  const cores = [
    { ...base, ranges: onSort },
    { ...base, ranges: [] },
  ];
  const core = cores.find((candidate) => getIndex(indexes, candidate));
  if (!core) {
    return null;
  }
  const narrowed =
    query.contains !== null || query.ranges.length > core.ranges.length;
  return { core, narrowed, terms: null };
}

export function planQuery(
  indexes: IndexDef[],
  query: QueryState,
): QueryPlan | null {
  if (query.search !== null) {
    return null;
  }
  return isMatchAny(query) ? planAny(indexes, query) : planAll(indexes, query);
}

interface Tier {
  indexes: IndexDef[];
  searchFields: string[];
  rangeFields: string[];
  containsFields: string[];
  groupFields: string[];
}

function createTier(
  indexes: IndexDef[],
  searchFields: string[],
  fields: BaseFieldDef[],
): Tier {
  return {
    indexes,
    searchFields,
    rangeFields: listNarrowRangeFields(fields),
    containsFields: listContainsFields(fields),
    groupFields: listGroupFields(fields, listEqualsFields(indexes)),
  };
}

function isGroupRunnable(tier: Tier, query: QueryState): boolean {
  const { group } = query;
  if (group === null) {
    return true;
  }
  const grouped: QueryState = {
    ...query,
    group: null,
    equals: { ...query.equals, [group]: query.equals[group] ?? GROUP_PROBE },
  };
  return (
    query.search === null &&
    !isMatchAny(query) &&
    tier.groupFields.includes(group) &&
    planQuery(tier.indexes, grouped) !== null
  );
}

function isTierRunnable(tier: Tier, query: QueryState): boolean {
  if (!isGroupRunnable(tier, query)) {
    return false;
  }
  if (query.search !== null) {
    return isQueryIndexed(tier.indexes, tier.searchFields, query);
  }
  return (
    query.ranges.every((range) => tier.rangeFields.includes(range.field)) &&
    (query.contains === null ||
      tier.containsFields.includes(query.contains.field)) &&
    planQuery(tier.indexes, query) !== null
  );
}

const tiers = new WeakMap<IndexedGridDef, Tier>();

export function isQueryRunnable(
  def: IndexedGridDef,
  query: QueryState,
): boolean {
  const tier =
    tiers.get(def) ??
    createTier(def.indexes, listSearchFields(def), def.fields);
  tiers.set(def, tier);
  return isTierRunnable(tier, query);
}

export function isGroupNarrowed(
  facetField: string | undefined,
  query: QueryState,
): boolean {
  return query.group !== null && query.group !== facetField;
}

function describeBasis(indexes: IndexDef[], query: QueryState): string {
  const plan = planQuery(indexes, query);
  if (!plan) {
    return "";
  }
  if (!isMatchAny(query)) {
    return JSON.stringify([
      "all",
      Object.entries(plan.core.equals).sort(),
      plan.core.ranges,
    ]);
  }
  return JSON.stringify([
    "any",
    Object.entries(query.equals).sort(),
    query.ranges,
    query.contains,
  ]);
}

export function isFacetOnlyQuery(
  facetField: string | undefined,
  query: QueryState,
): boolean {
  return (
    facetField !== undefined &&
    query.ranges.length === 0 &&
    query.search === null &&
    !hasNarrowParts(query) &&
    Object.entries(query.equals).every(
      ([key, values]) =>
        key === facetField &&
        !values.includes(EMPTY_VALUE) &&
        !values.includes(NOT_EMPTY_VALUE),
    )
  );
}

export function indexRunnable(
  indexes: IndexDef[],
  options: IndexRunnableOptions = {},
): RunnableQueries {
  const searchFields = options.searchFields ?? [];
  const tier = options.fields
    ? createTier(indexes, searchFields, options.fields)
    : null;
  return {
    holdsAllRows: false,
    searchIsOrdered: false,
    facetCountsFollowFilters: false,
    narrowLimited: tier !== null,
    matchAny: tier !== null,
    canRun: (query) =>
      tier
        ? isTierRunnable(tier, query)
        : query.group === null && isQueryIndexed(indexes, searchFields, query),
    isNarrowed: (query) =>
      tier !== null &&
      (isGroupNarrowed(options.facetField, query) ||
        (planQuery(indexes, query)?.narrowed ?? false)),
    narrowBasis: (query) => describeBasis(indexes, query),
    equalsFields: listEqualsFields(indexes),
    rangeFields: tier?.rangeFields ?? listRangeFields(indexes),
    containsFields: tier?.containsFields ?? [],
    groupFields: tier?.groupFields ?? [],
    sortFields: listSortFields(indexes),
    searchFields,
    isFacetCountExact: (query) => isFacetOnlyQuery(options.facetField, query),
  };
}

export function gridDefRunnable(def: IndexedGridDef): RunnableQueries {
  return indexRunnable(def.indexes, {
    facetField: def.facet?.field,
    searchFields: listSearchFields(def),
    fields: def.fields,
  });
}
