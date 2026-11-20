import {
  KEY_FIELD,
  listSearchFields,
  type BaseFieldDef,
  type IndexDef,
  type IndexedGridDef,
  type IndexExtras,
} from "./grid-def.ts";
import {
  isLiteralOp,
  listFieldOps,
  resolveFieldKind,
  TEXT_MATCH_OPS,
  type FilterOp,
} from "./operators.ts";
import {
  isListFilter,
  listSorts,
  listThenBy,
  SORT_MAX,
  withThenBy,
  type Filter,
  type QueryState,
} from "./query-state.ts";
import type { DataSourceCapabilities } from "./capabilities.ts";

export interface IndexCapabilitiesOptions extends IndexExtras {
  facetField?: string;
  searchFields?: string[];
  fields?: BaseFieldDef[];
}

const GROUP_PROBE = ["x"];
const NO_EXTRAS: IndexExtras = {};
const RANGE_OPS: FilterOp[] = [
  "greater_than",
  "greater_or_equal",
  "less_than",
  "less_or_equal",
  "between",
  "in_period",
];

export const TEXT_INDEX_MIN_LENGTH = 3;

export interface QueryPlan {
  core: QueryState;
  narrowed: boolean;
  budgeted: boolean;
  terms: QueryState[] | null;
}

type Access = "equality" | "range" | "budgeted" | "narrow";

interface IndexFields {
  equals: string[];
  ranges: string[];
}

export function indexId(index: IndexDef): string {
  const order = [index.sort, ...(index.then ?? [])].join(">");
  const id = `${[...index.equals].sort().join("+")}|${order}`;
  return index.blank?.length
    ? `${id}|empty:${[...index.blank].sort().join("+")}`
    : id;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

const indexFields = new WeakMap<IndexDef[], IndexFields>();

function readIndexFields(indexes: IndexDef[]): IndexFields {
  const known = indexFields.get(indexes);
  if (known) {
    return known;
  }
  const fields: IndexFields = {
    equals: unique(indexes.flatMap((index) => index.equals)),
    ranges: unique(
      indexes.filter((index) => index.range).map((index) => index.sort),
    ),
  };
  indexFields.set(indexes, fields);
  return fields;
}

export function listSortFields(indexes: IndexDef[]): string[] {
  return unique(indexes.map((index) => index.sort));
}

export function listSortOrders(indexes: IndexDef[]): string[][] {
  const orders = new Map<string, string[]>();
  for (const index of indexes) {
    if (index.then?.length) {
      const order = [index.sort, ...index.then];
      orders.set(order.join(">"), order);
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

export function isTextIndexed(extras: IndexExtras, filter: Filter): boolean {
  return (
    (extras.textIndexes ?? []).includes(filter.field) &&
    TEXT_MATCH_OPS.includes(filter.op) &&
    "value" in filter &&
    filter.value.trim().length >= TEXT_INDEX_MIN_LENGTH
  );
}

export function isOverlapIndexed(extras: IndexExtras, field: string): boolean {
  return (extras.arrayIndexes ?? []).includes(field);
}

export function isCombineOr(query: QueryState): boolean {
  return query.combine === "or" && query.filters.length > 1;
}

// A partial index's blank field is answered by that index only beside the equalities it is keyed on; alone it runs over the narrowed set.
function isPartialBlank(
  indexes: IndexDef[],
  key: string,
  filters: Filter[],
): boolean {
  const filtered = filters.map((filter) => filter.field);
  return indexes.some(
    (index) =>
      (index.blank ?? []).includes(key) &&
      index.equals.every((equal) => filtered.includes(equal)),
  );
}

function classify(
  indexes: IndexDef[],
  extras: IndexExtras,
  filter: Filter,
  filters: Filter[] = [filter],
): Access {
  const fields = readIndexFields(indexes);
  const { field } = filter;
  switch (filter.op) {
    case "any_of":
      if (fields.equals.includes(field)) {
        return "equality";
      }
      return isOverlapIndexed(extras, field) ? "budgeted" : "narrow";
    case "all_of":
      return isOverlapIndexed(extras, field) ? "budgeted" : "narrow";
    case "blank":
      return fields.equals.includes(field) ||
        isPartialBlank(indexes, field, filters)
        ? "equality"
        : "narrow";
    case "not_blank":
      return fields.equals.includes(field) ? "equality" : "narrow";
    case "equals":
      if (fields.equals.includes(field)) {
        return "equality";
      }
      return fields.ranges.includes(field) ? "range" : "narrow";
    case "contains":
    case "starts_with":
    case "ends_with":
      return isTextIndexed(extras, filter) ? "budgeted" : "narrow";
    default:
      return RANGE_OPS.includes(filter.op) ? "range" : "narrow";
  }
}

function pick(
  indexes: IndexDef[],
  extras: IndexExtras,
  filters: Filter[],
  access: Access,
): Filter[] {
  return filters.filter(
    (filter) => classify(indexes, extras, filter, filters) === access,
  );
}

function answersEquality(index: IndexDef, filters: Filter[]): boolean {
  const blank = index.blank ?? [];
  const keys = unique(
    filters.map((filter) => filter.field).filter((key) => !blank.includes(key)),
  );
  return (
    sameSet(index.equals, keys) &&
    blank.every((key) => {
      const own = filters.filter((filter) => filter.field === key);
      return own.length === 1 && own[0].op === "blank";
    })
  );
}

// One btree read forward or backward gives every column the same direction, so a composite order is answered only when its columns all run the way the first does.
function answersSort(index: IndexDef, query: QueryState): boolean {
  const then = index.then ?? [];
  const thenBy = listThenBy(query);
  return (
    index.sort === query.sort.field &&
    then.length === thenBy.length &&
    thenBy.every(
      (sort, at) =>
        sort.field === then[at] && sort.direction === query.sort.direction,
    )
  );
}

function answersQuery(
  index: IndexDef,
  query: QueryState,
  equality: Filter[],
  ranges: Filter[],
): boolean {
  const [range] = ranges;
  if (!answersSort(index, query) || !answersEquality(index, equality)) {
    return false;
  }
  if (range && (!index.range || range.field !== index.sort)) {
    return false;
  }
  const several = equality.some(
    (filter) => isListFilter(filter) && filter.values.length > 1,
  );
  return !(several && index.multi === false);
}

export function getIndex(
  indexes: IndexDef[],
  query: QueryState,
  extras: IndexExtras = NO_EXTRAS,
): IndexDef | null {
  const ranges = pick(indexes, extras, query.filters, "range");
  if (
    query.search !== null ||
    ranges.length > 1 ||
    isCombineOr(query) ||
    pick(indexes, extras, query.filters, "narrow").length > 0
  ) {
    return null;
  }
  const equality = pick(indexes, extras, query.filters, "equality");
  return (
    indexes.find((index) => answersQuery(index, query, equality, ranges)) ??
    null
  );
}

export function isQueryIndexed(
  indexes: IndexDef[],
  searchFields: string[],
  query: QueryState,
  extras: IndexExtras = NO_EXTRAS,
): boolean {
  if (query.search === null) {
    return getIndex(indexes, query, extras) !== null;
  }
  return (
    searchFields.length > 0 &&
    !isCombineOr(query) &&
    query.filters.every(
      (filter) =>
        classify(indexes, extras, filter, query.filters) === "equality",
    ) &&
    listSortFields(indexes).includes(query.sort.field)
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

function listTerms(
  indexes: IndexDef[],
  query: QueryState,
): QueryState[] | null {
  const base = withThenBy(withoutFilters(query), []);
  const terms: QueryState[] = [];
  for (const filter of query.filters) {
    const access = classify(indexes, NO_EXTRAS, filter, query.filters);
    if (access !== "equality" && access !== "range") {
      return null;
    }
    const index = indexes.find(
      (item) => sameSet(item.equals, [filter.field]) && !item.then?.length,
    );
    const sort =
      access === "range" ? filter.field : (index?.sort ?? base.sort.field);
    terms.push({
      ...base,
      filters: [filter],
      sort: { ...base.sort, field: sort },
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
    terms !== null && terms.every((term) => getIndex(indexes, term) !== null);
  return {
    core: withoutFilters(query),
    narrowed: true,
    budgeted: false,
    terms: countable ? terms : null,
  };
}

// A text or array filter stays in the core only when its own index answers it and nothing else needs the narrowed set: a narrowed core is counted up to the limit, which no trigram scan should be asked to do.
function planAll(
  indexes: IndexDef[],
  query: QueryState,
  extras: IndexExtras,
): QueryPlan | null {
  const base: QueryState = { ...query, combine: "and", group: null };
  const equality = pick(indexes, extras, query.filters, "equality");
  const ranges = pick(indexes, extras, query.filters, "range");
  const budgeted = pick(indexes, extras, query.filters, "budgeted");
  const narrow = pick(indexes, extras, query.filters, "narrow");
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
  const core = cores.find((candidate) => getIndex(indexes, candidate, extras));
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
  indexes: IndexDef[],
  query: QueryState,
  extras: IndexExtras = NO_EXTRAS,
): QueryPlan | null {
  if (query.search !== null) {
    return null;
  }
  return isCombineOr(query)
    ? planAny(indexes, query)
    : planAll(indexes, query, extras);
}

// What a field may ever be filtered by on an indexed source: the operators some tier answers. An equality set needs an index of its own; every other operator falls back to the narrowed set.
function listTierOps(indexes: IndexDef[], field: BaseFieldDef): FilterOp[] {
  const equality = readIndexFields(indexes).equals.includes(field.key);
  const kind = resolveFieldKind(field);
  return listFieldOps(field).filter((op) => {
    if (isLiteralOp(field, op)) {
      return false;
    }
    const set = op === "any_of" || op === "none_of";
    return !(kind === "choice" && set) || equality;
  });
}

export function listFilterOps(
  indexes: IndexDef[],
  fields: BaseFieldDef[],
): Record<string, FilterOp[]> {
  return Object.fromEntries(
    fields
      .map((field) => [field.key, listTierOps(indexes, field)] as const)
      .filter(([, ops]) => ops.length > 0),
  );
}

function listIndexOps(indexes: IndexDef[]): Record<string, FilterOp[]> {
  const fields = readIndexFields(indexes);
  const ops: Record<string, FilterOp[]> = {};
  for (const key of fields.equals) {
    ops[key] = ["any_of"];
  }
  for (const key of fields.ranges) {
    ops[key] = [
      ...(ops[key] ?? []),
      "equals",
      ...RANGE_OPS.filter((op) => op !== "in_period"),
    ];
  }
  return ops;
}

interface Tier {
  indexes: IndexDef[];
  extras: IndexExtras;
  searchFields: string[];
  filterOps: Record<string, FilterOp[]>;
  groupFields: string[];
  thenByFields: string[];
}

function createTier(
  indexes: IndexDef[],
  extras: IndexExtras,
  searchFields: string[],
  fields: BaseFieldDef[],
): Tier {
  return {
    indexes,
    extras: {
      textIndexes: extras.textIndexes,
      arrayIndexes: extras.arrayIndexes,
    },
    searchFields,
    filterOps: listFilterOps(indexes, fields),
    groupFields: listGroupFields(fields, readIndexFields(indexes).equals),
    thenByFields: listThenByFields(fields),
  };
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
    planQuery(tier.indexes, grouped, tier.extras) !== null
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
    return isQueryIndexed(tier.indexes, tier.searchFields, query, tier.extras);
  }
  return planQuery(tier.indexes, query, tier.extras) !== null;
}

const tiers = new WeakMap<IndexedGridDef, Tier>();

function readTier(def: IndexedGridDef): Tier {
  const tier =
    tiers.get(def) ??
    createTier(def.indexes, def, listSearchFields(def), def.fields);
  tiers.set(def, tier);
  return tier;
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
  return (
    query.search !== null ||
    (planQuery(def.indexes, query, def)?.budgeted ?? false)
  );
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

function describeBasis(
  indexes: IndexDef[],
  query: QueryState,
  extras: IndexExtras,
): string {
  const plan = planQuery(indexes, query, extras);
  if (!plan) {
    return "";
  }
  if (!isCombineOr(query)) {
    const bounding = plan.core.filters.filter((filter) => {
      const access = classify(indexes, extras, filter, plan.core.filters);
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

export function indexCapabilities(
  indexes: IndexDef[],
  options: IndexCapabilitiesOptions = {},
): DataSourceCapabilities {
  const searchFields = options.searchFields ?? [];
  const tier = options.fields
    ? createTier(indexes, options, searchFields, options.fields)
    : null;
  const extras = tier?.extras ?? NO_EXTRAS;
  const thenByFields = tier?.thenByFields ?? [
    ...new Set(indexes.flatMap((index) => index.then ?? [])),
  ];
  return {
    holdsAllRows: false,
    searchIsOrdered: false,
    facetCountsFollowFilters: false,
    narrowLimited: tier !== null,
    combineOr: tier !== null,
    canRun: (query) =>
      tier
        ? isTierRunnable(tier, query)
        : query.group === null &&
          hasValidThenBy(query, thenByFields) &&
          isQueryIndexed(indexes, searchFields, query),
    isNarrowed: (query) =>
      tier !== null &&
      (isGroupNarrowed(options.facetField, query) ||
        (planQuery(indexes, query, extras)?.narrowed ?? false)),
    narrowBasis: (query) => describeBasis(indexes, query, extras),
    filterOps: tier?.filterOps ?? listIndexOps(indexes),
    groupFields: tier?.groupFields ?? [],
    sortFields: listSortFields(indexes),
    thenByFields,
    sortOrders: listSortOrders(indexes),
    searchFields,
    isFacetCountExact: (query) => isFacetOnlyQuery(options.facetField, query),
  };
}

export function gridDefCapabilities(
  def: IndexedGridDef,
): DataSourceCapabilities {
  return indexCapabilities(def.indexes, {
    facetField: def.facet?.field,
    searchFields: listSearchFields(def),
    fields: def.fields,
    textIndexes: def.textIndexes,
    arrayIndexes: def.arrayIndexes,
  });
}
