import {
  getField,
  isRangeType,
  KEY_FIELD,
  listArrayIndexed,
  listSearchFields,
  listSortIndexes,
  listTextIndexed,
  type BaseFieldDef,
  type IndexDef,
  type IndexedGridDef,
  type SortIndexDef,
} from "./grid-def.ts";
import {
  isLiteralOp,
  listFieldOps,
  listIndexKinds,
  resolveFieldKind,
  type FilterOp,
} from "./operators.ts";
import {
  listSorts,
  listThenBy,
  SORT_MAX,
  withThenBy,
  type Filter,
  type QueryState,
} from "./query-state.ts";
import type { DataSourceCapabilities } from "./capabilities.ts";

const GROUP_PROBE = ["x"];

export const TEXT_INDEX_MIN_LENGTH = 3;

export interface QueryPlan {
  core: QueryState;
  narrowed: boolean;
  budgeted: boolean;
  terms: QueryState[] | null;
}

type Access = "equality" | "range" | "budgeted" | "narrow";

interface Planner {
  sorts: SortIndexDef[];
  filtered: string[];
  ranged: string[];
  texts: string[];
  arrays: string[];
}

export function indexId(index: IndexDef): string {
  if ("text" in index) {
    return `text:${index.text}`;
  }
  if ("array" in index) {
    return `array:${index.array}`;
  }
  return `${[...index.filter].sort().join("+")}|${index.sort.join(">")}`;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function isRangeSort(def: IndexedGridDef, key: string): boolean {
  const field = getField(def, key);
  return field !== null && isRangeType(field.type);
}

const planners = new WeakMap<IndexedGridDef, Planner>();
const orderedPlanners = new WeakMap<IndexedGridDef, Planner>();

// A size is of the rows the ordered indexes leave, so the ordered planner knows no text or array index and never counts through one.
function readPlanner(def: IndexedGridDef, ordered = false): Planner {
  const cache = ordered ? orderedPlanners : planners;
  const known = cache.get(def);
  if (known) {
    return known;
  }
  const sorts = listSortIndexes(def.indexes);
  const planner: Planner = {
    sorts,
    filtered: unique(sorts.flatMap((index) => index.filter)),
    ranged: unique(
      sorts
        .map((index) => index.sort[0])
        .filter((key) => isRangeSort(def, key)),
    ),
    texts: ordered ? [] : listTextIndexed(def.indexes),
    arrays: ordered ? [] : listArrayIndexed(def.indexes),
  };
  cache.set(def, planner);
  return planner;
}

export function listSortFields(indexes: IndexDef[]): string[] {
  return unique(listSortIndexes(indexes).map((index) => index.sort[0]));
}

export function listSortOrders(indexes: IndexDef[]): string[][] {
  const orders = new Map<string, string[]>();
  for (const index of listSortIndexes(indexes)) {
    if (index.sort.length > 1) {
      orders.set(index.sort.join(">"), index.sort);
    }
  }
  return [...orders.values()];
}

// Over a narrowed set a further sort column is read and sorted in one pass, so it needs no index, only a value in every row: a nullable column has no keyset.
export function listThenByFields(fields: BaseFieldDef[]): string[] {
  return fields
    .filter(
      (field) =>
        !field.nullable && !isOverlapField(field) && field.key !== KEY_FIELD,
    )
    .map((field) => field.key);
}

export function hasValidThenBy(query: QueryState, allowed: string[]): boolean {
  const keys = listSorts(query).map((sort) => sort.field);
  return (
    keys.length <= SORT_MAX &&
    new Set(keys).size === keys.length &&
    keys.slice(1).every((key) => allowed.includes(key))
  );
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

export function isTextField(field: BaseFieldDef): boolean {
  return resolveFieldKind(field) === "text";
}

export function isOverlapField(field: BaseFieldDef): boolean {
  return field.type === "array";
}

function isLongEnough(filter: Filter): boolean {
  return (
    "value" in filter && filter.value.trim().length >= TEXT_INDEX_MIN_LENGTH
  );
}

export function isCombineOr(query: QueryState): boolean {
  return query.combine === "or" && query.filters.length > 1;
}

function classify(planner: Planner, filter: Filter): Access {
  const { field } = filter;
  for (const kind of listIndexKinds(filter.op)) {
    if (kind === "filter" && planner.filtered.includes(field)) {
      return "equality";
    }
    if (kind === "sort" && planner.ranged.includes(field)) {
      return "range";
    }
    if (
      kind === "text" &&
      planner.texts.includes(field) &&
      isLongEnough(filter)
    ) {
      return "budgeted";
    }
    if (kind === "array" && planner.arrays.includes(field)) {
      return "budgeted";
    }
  }
  return "narrow";
}

function pick(planner: Planner, filters: Filter[], access: Access): Filter[] {
  return filters.filter((filter) => classify(planner, filter) === access);
}

function answersEquality(index: SortIndexDef, filters: Filter[]): boolean {
  return sameSet(index.filter, unique(filters.map((filter) => filter.field)));
}

// One btree read forward or backward gives every column the same direction, so a composite order is answered only when its columns all run the way the first does.
function answersSort(index: SortIndexDef, query: QueryState): boolean {
  const [first, ...then] = index.sort;
  const thenBy = listThenBy(query);
  return (
    first === query.sort.field &&
    then.length === thenBy.length &&
    thenBy.every(
      (sort, at) =>
        sort.field === then[at] && sort.direction === query.sort.direction,
    )
  );
}

function answersQuery(
  index: SortIndexDef,
  query: QueryState,
  equality: Filter[],
  ranges: Filter[],
): boolean {
  const [range] = ranges;
  return (
    answersSort(index, query) &&
    answersEquality(index, equality) &&
    (!range || range.field === index.sort[0])
  );
}

function findIndex(planner: Planner, query: QueryState): SortIndexDef | null {
  const ranges = pick(planner, query.filters, "range");
  if (
    query.search !== null ||
    ranges.length > 1 ||
    isCombineOr(query) ||
    pick(planner, query.filters, "narrow").length > 0
  ) {
    return null;
  }
  const equality = pick(planner, query.filters, "equality");
  return (
    planner.sorts.find((index) =>
      answersQuery(index, query, equality, ranges),
    ) ?? null
  );
}

export function getIndex(
  def: IndexedGridDef,
  query: QueryState,
): SortIndexDef | null {
  return findIndex(readPlanner(def), query);
}

export function isQueryIndexed(
  def: IndexedGridDef,
  query: QueryState,
): boolean {
  const planner = readPlanner(def);
  if (query.search === null) {
    return findIndex(planner, query) !== null;
  }
  return (
    listSearchFields(def).length > 0 &&
    !isCombineOr(query) &&
    query.filters.every((filter) => classify(planner, filter) === "equality") &&
    listSortFields(def.indexes).includes(query.sort.field)
  );
}

export function withoutFilters(query: QueryState): QueryState {
  return {
    ...query,
    filters: [],
    combine: "and",
    group: null,
    cursor: null,
  };
}

function listTerms(planner: Planner, query: QueryState): QueryState[] | null {
  const base = withThenBy(withoutFilters(query), []);
  const terms: QueryState[] = [];
  for (const filter of query.filters) {
    const access = classify(planner, filter);
    if (access !== "equality" && access !== "range") {
      return null;
    }
    const index = planner.sorts.find(
      (item) => sameSet(item.filter, [filter.field]) && item.sort.length === 1,
    );
    const sort =
      access === "range" ? filter.field : (index?.sort[0] ?? base.sort.field);
    terms.push({
      ...base,
      filters: [filter],
      sort: { ...base.sort, field: sort },
    });
  }
  return terms;
}

function planAny(planner: Planner, query: QueryState): QueryPlan | null {
  if (!planner.sorts.some((index) => index.sort[0] === query.sort.field)) {
    return null;
  }
  const terms = listTerms(planner, query);
  const countable =
    terms !== null && terms.every((term) => findIndex(planner, term) !== null);
  return {
    core: withoutFilters(query),
    narrowed: true,
    budgeted: false,
    terms: countable ? terms : null,
  };
}

// A text or array filter stays in the core only when its own index answers it and nothing else needs the narrowed set: a narrowed core is counted up to the limit, which no trigram scan should be asked to do.
function planAll(planner: Planner, query: QueryState): QueryPlan | null {
  const base: QueryState = { ...query, combine: "and", group: null };
  const equality = pick(planner, query.filters, "equality");
  const ranges = pick(planner, query.filters, "range");
  const budgeted = pick(planner, query.filters, "budgeted");
  const narrow = pick(planner, query.filters, "narrow");
  const onSort = ranges
    .filter((range) => range.field === query.sort.field)
    .slice(0, 1);
  const indexed =
    budgeted.length > 0 &&
    narrow.length === 0 &&
    ranges.length === onSort.length;
  const ranged = { ...base, filters: [...equality, ...onSort] };
  const plain = { ...base, filters: equality };
  const sorted = listThenBy(query).length > 0;
  // A core that drops a sort column is a narrowed one, so it never keeps a text or an array filter, and it keeps the range before it keeps the order: the range is what bounds the rows.
  const cores: QueryState[] = [
    ...(indexed
      ? [{ ...base, filters: [...equality, ...onSort, ...budgeted] }]
      : []),
    ranged,
    ...(sorted ? [withThenBy(ranged, [])] : []),
    plain,
    ...(sorted ? [withThenBy(plain, [])] : []),
  ];
  const core = cores.find((candidate) => findIndex(planner, candidate));
  if (!core) {
    return null;
  }
  const coreBudgeted = core.filters.some((filter) => budgeted.includes(filter));
  const coreRanges = core.filters.filter((filter) => ranges.includes(filter));
  const narrowed =
    narrow.length > 0 ||
    (!coreBudgeted && budgeted.length > 0) ||
    ranges.length > coreRanges.length ||
    listThenBy(query).length > listThenBy(core).length;
  return { core, narrowed, budgeted: coreBudgeted, terms: null };
}

export function planQuery(
  def: IndexedGridDef,
  query: QueryState,
  ordered = false,
): QueryPlan | null {
  if (query.search !== null) {
    return null;
  }
  const planner = readPlanner(def, ordered);
  return isCombineOr(query) ? planAny(planner, query) : planAll(planner, query);
}

// A choice set needs a filter index of its own, while every other operator falls back to the narrowed set.
function listTierOps(planner: Planner, field: BaseFieldDef): FilterOp[] {
  const filtered = planner.filtered.includes(field.key);
  const kind = resolveFieldKind(field);
  return listFieldOps(field).filter((op) => {
    if (isLiteralOp(field, op)) {
      return false;
    }
    const set = op === "any_of" || op === "none_of";
    return !(kind === "choice" && set) || filtered;
  });
}

export function listFilterOps(def: IndexedGridDef): Record<string, FilterOp[]> {
  const planner = readPlanner(def);
  return Object.fromEntries(
    def.fields
      .map((field) => [field.key, listTierOps(planner, field)] as const)
      .filter(([, ops]) => ops.length > 0),
  );
}

export function hasFilterOps(
  filterOps: Record<string, FilterOp[]>,
  query: QueryState,
): boolean {
  return query.filters.every(
    (filter) =>
      Object.hasOwn(filterOps, filter.field) &&
      filterOps[filter.field].includes(filter.op),
  );
}

interface Tier {
  def: IndexedGridDef;
  filterOps: Record<string, FilterOp[]>;
  groupFields: string[];
  thenByFields: string[];
}

const tiers = new WeakMap<IndexedGridDef, Tier>();

function readTier(def: IndexedGridDef): Tier {
  const known = tiers.get(def);
  if (known) {
    return known;
  }
  const tier: Tier = {
    def,
    filterOps: listFilterOps(def),
    groupFields: listGroupFields(def.fields, readPlanner(def).filtered),
    thenByFields: listThenByFields(def.fields),
  };
  tiers.set(def, tier);
  return tier;
}

function isGroupRunnable(tier: Tier, query: QueryState): boolean {
  const { group } = query;
  if (group === null) {
    return true;
  }
  const filtered = query.filters.some((filter) => filter.field === group);
  const grouped: QueryState = {
    ...query,
    group: null,
    filters: filtered
      ? query.filters
      : [...query.filters, { field: group, op: "any_of", values: GROUP_PROBE }],
  };
  return (
    query.search === null &&
    !isCombineOr(query) &&
    tier.groupFields.includes(group) &&
    planQuery(tier.def, grouped) !== null
  );
}

function isTierRunnable(tier: Tier, query: QueryState): boolean {
  if (
    !isGroupRunnable(tier, query) ||
    !hasValidThenBy(query, tier.thenByFields) ||
    !hasFilterOps(tier.filterOps, query)
  ) {
    return false;
  }
  if (query.search !== null) {
    return isQueryIndexed(tier.def, query);
  }
  return planQuery(tier.def, query) !== null;
}

export function isQueryRunnable(
  def: IndexedGridDef,
  query: QueryState,
): boolean {
  return isTierRunnable(readTier(def), query);
}

// The search and a filter answered by a text or array index cost what they match, not what the page holds: these are the queries a source runs under its time budget.
export function isQueryBudgeted(
  def: IndexedGridDef,
  query: QueryState,
): boolean {
  return query.search !== null || (planQuery(def, query)?.budgeted ?? false);
}

export function isGroupNarrowed(
  facetField: string | undefined,
  query: QueryState,
): boolean {
  return query.group !== null && query.group !== facetField;
}

function canonical(filters: Filter[]): string[] {
  return filters.map((filter) => JSON.stringify(filter)).sort();
}

function describeBasis(def: IndexedGridDef, query: QueryState): string {
  const plan = planQuery(def, query);
  if (!plan) {
    return "";
  }
  if (!isCombineOr(query)) {
    const planner = readPlanner(def);
    const bounding = plan.core.filters.filter((filter) => {
      const access = classify(planner, filter);
      return access === "equality" || access === "range";
    });
    return JSON.stringify(["and", canonical(bounding)]);
  }
  return JSON.stringify(["or", canonical(query.filters)]);
}

export function isFacetOnlyQuery(
  facetField: string | undefined,
  query: QueryState,
): boolean {
  return (
    facetField !== undefined &&
    query.search === null &&
    !isCombineOr(query) &&
    query.filters.every(
      (filter) =>
        filter.field === facetField &&
        filter.op === "any_of" &&
        !filter.values.includes(null),
    )
  );
}

export function gridDefCapabilities(
  def: IndexedGridDef,
): DataSourceCapabilities {
  const tier = readTier(def);
  const facetField = def.facet?.field;
  return {
    holdsAllRows: false,
    searchIsOrdered: false,
    facetCountsFollowFilters: false,
    narrowLimited: true,
    combineOr: true,
    canRun: (query) => isTierRunnable(tier, query),
    isNarrowed: (query) =>
      isGroupNarrowed(facetField, query) ||
      (planQuery(def, query)?.narrowed ?? false),
    narrowBasis: (query) => describeBasis(def, query),
    filterOps: tier.filterOps,
    groupFields: tier.groupFields,
    sortFields: listSortFields(def.indexes),
    thenByFields: tier.thenByFields,
    sortOrders: listSortOrders(def.indexes),
    searchFields: listSearchFields(def),
    isFacetCountExact: (query) => isFacetOnlyQuery(facetField, query),
  };
}
