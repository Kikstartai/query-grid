import {
  isRangeType,
  listSearchFields,
  type BaseFieldDef,
  type IndexDef,
  type IndexedGridDef,
  type IndexExtras,
} from "./grid-def.ts";
import type { QueryState, TextOp, TextState } from "./query-state.ts";
import type { DataSourceCapabilities } from "./capabilities.ts";
import { EMPTY_VALUE, NOT_EMPTY_VALUE } from "./field-values.ts";

export interface IndexCapabilitiesOptions extends IndexExtras {
  facetField?: string;
  searchFields?: string[];
  fields?: BaseFieldDef[];
}

const GROUP_PROBE = ["x"];
const NO_EXTRAS: IndexExtras = {};
export const INDEXED_TEXT_OPS: TextOp[] = [
  "contains",
  "starts_with",
  "ends_with",
];

export const TEXT_INDEX_MIN_LENGTH = 3;

export interface QueryPlan {
  core: QueryState;
  narrowed: boolean;
  budgeted: boolean;
  terms: QueryState[] | null;
}

export function indexId(index: IndexDef): string {
  const id = `${[...index.equals].sort().join("+")}|${index.sort}`;
  return index.empty?.length
    ? `${id}|empty:${[...index.empty].sort().join("+")}`
    : id;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function listEqualsFields(indexes: IndexDef[]): string[] {
  return [...new Set(indexes.flatMap((index) => index.equals))];
}

// A partial index's empty fields can be filtered to empty and nothing else, so they are answerable without being fields a control or the URL offers.
function listAnswerableFields(indexes: IndexDef[]): string[] {
  return [
    ...new Set(
      indexes.flatMap((index) => [...index.equals, ...(index.empty ?? [])]),
    ),
  ];
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

export function isTextField(field: BaseFieldDef): boolean {
  return field.type === "text" && !field.options;
}

export function listTextFields(fields: BaseFieldDef[]): string[] {
  return fields.filter(isTextField).map((field) => field.key);
}

export function listTextFilterFields(
  capabilities: DataSourceCapabilities,
  keys?: string[],
): string[] {
  return capabilities.textFields.filter(
    (key) => keys === undefined || keys.includes(key),
  );
}

export function isOverlapField(field: BaseFieldDef): boolean {
  return field.type === "array";
}

export function listOverlapFields(fields: BaseFieldDef[]): string[] {
  return fields.filter(isOverlapField).map((field) => field.key);
}

export function isTextIndexed(extras: IndexExtras, text: TextState): boolean {
  return (
    (extras.textIndexes ?? []).includes(text.field) &&
    INDEXED_TEXT_OPS.includes(text.op) &&
    text.value.trim().length >= TEXT_INDEX_MIN_LENGTH
  );
}

export function isOverlapIndexed(extras: IndexExtras, field: string): boolean {
  return (extras.arrayIndexes ?? []).includes(field);
}

export function countFilterTerms(query: QueryState): number {
  return (
    Object.keys(query.equals).length +
    query.ranges.length +
    query.texts.length +
    Object.keys(query.overlaps).length
  );
}

export function isMatchAny(query: QueryState): boolean {
  return query.match === "any" && countFilterTerms(query) > 1;
}

function hasTextOrOverlap(query: QueryState): boolean {
  return query.texts.length > 0 || Object.keys(query.overlaps).length > 0;
}

function hasUnindexedParts(query: QueryState, extras: IndexExtras): boolean {
  return (
    query.texts.some((text) => !isTextIndexed(extras, text)) ||
    Object.keys(query.overlaps).some((key) => !isOverlapIndexed(extras, key))
  );
}

function hasNarrowParts(query: QueryState, extras: IndexExtras): boolean {
  return (
    isMatchAny(query) ||
    hasUnindexedParts(query, extras) ||
    query.ranges.some((range) => range.exclude)
  );
}

function answersEquals(
  index: IndexDef,
  equals: Record<string, string[]>,
): boolean {
  const empty = index.empty ?? [];
  const keys = Object.keys(equals).filter((key) => !empty.includes(key));
  return (
    sameSet(index.equals, keys) &&
    empty.every((key) => {
      const values = equals[key] ?? [];
      return values.length === 1 && values[0] === EMPTY_VALUE;
    })
  );
}

function answersQuery(index: IndexDef, query: QueryState): boolean {
  const [range] = query.ranges;
  if (index.sort !== query.sort.field || !answersEquals(index, query.equals)) {
    return false;
  }
  if (range && (!index.range || range.field !== index.sort)) {
    return false;
  }
  const several = Object.values(query.equals).some(
    (values) => values.length > 1,
  );
  return !(several && index.multi === false);
}

export function getIndex(
  indexes: IndexDef[],
  query: QueryState,
  extras: IndexExtras = NO_EXTRAS,
): IndexDef | null {
  if (
    query.search !== null ||
    query.ranges.length > 1 ||
    hasNarrowParts(query, extras)
  ) {
    return null;
  }
  return indexes.find((index) => answersQuery(index, query)) ?? null;
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
  const equalsFields = listAnswerableFields(indexes);
  return (
    searchFields.length > 0 &&
    !isMatchAny(query) &&
    !hasTextOrOverlap(query) &&
    Object.keys(query.equals).every((key) => equalsFields.includes(key)) &&
    query.ranges.length === 0 &&
    listSortFields(indexes).includes(query.sort.field)
  );
}

export function withoutFilters(query: QueryState): QueryState {
  return {
    ...query,
    equals: {},
    ranges: [],
    texts: [],
    overlaps: {},
    match: "all",
    group: null,
    cursor: null,
  };
}

function listTerms(indexes: IndexDef[], query: QueryState): QueryState[] {
  const base = withoutFilters(query);
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
    !hasTextOrOverlap(query) &&
    terms.every((term) => getIndex(indexes, term) !== null);
  return {
    core: withoutFilters(query),
    narrowed: true,
    budgeted: false,
    terms: countable ? terms : null,
  };
}

// A text or overlap filter stays in the core only when its own index answers it and nothing else needs the narrowed set: a narrowed core is counted up to the limit, which no trigram scan should be asked to do.
function planAll(
  indexes: IndexDef[],
  query: QueryState,
  extras: IndexExtras,
): QueryPlan | null {
  const base: QueryState = {
    ...query,
    texts: [],
    overlaps: {},
    match: "all",
    group: null,
  };
  const onSort = query.ranges
    .filter((range) => range.field === query.sort.field && !range.exclude)
    .slice(0, 1);
  const indexed =
    hasTextOrOverlap(query) &&
    !hasUnindexedParts(query, extras) &&
    query.ranges.length === onSort.length;
  const cores: QueryState[] = [
    ...(indexed
      ? [
          {
            ...base,
            texts: query.texts,
            overlaps: query.overlaps,
            ranges: onSort,
          },
        ]
      : []),
    { ...base, ranges: onSort },
    { ...base, ranges: [] },
  ];
  const core = cores.find((candidate) => getIndex(indexes, candidate, extras));
  if (!core) {
    return null;
  }
  const budgeted = hasTextOrOverlap(core);
  const narrowed =
    (!budgeted && hasTextOrOverlap(query)) ||
    query.ranges.length > core.ranges.length;
  return { core, narrowed, budgeted, terms: null };
}

export function planQuery(
  indexes: IndexDef[],
  query: QueryState,
  extras: IndexExtras = NO_EXTRAS,
): QueryPlan | null {
  if (query.search !== null) {
    return null;
  }
  return isMatchAny(query)
    ? planAny(indexes, query)
    : planAll(indexes, query, extras);
}

interface Tier {
  indexes: IndexDef[];
  extras: IndexExtras;
  searchFields: string[];
  rangeFields: string[];
  textFields: string[];
  overlapFields: string[];
  groupFields: string[];
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
    rangeFields: listNarrowRangeFields(fields),
    textFields: listTextFields(fields),
    overlapFields: listOverlapFields(fields),
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
    planQuery(tier.indexes, grouped, tier.extras) !== null
  );
}

function isTierRunnable(tier: Tier, query: QueryState): boolean {
  if (!isGroupRunnable(tier, query)) {
    return false;
  }
  if (query.search !== null) {
    return isQueryIndexed(tier.indexes, tier.searchFields, query, tier.extras);
  }
  return (
    query.ranges.every((range) => tier.rangeFields.includes(range.field)) &&
    query.texts.every((text) => tier.textFields.includes(text.field)) &&
    Object.keys(query.overlaps).every((key) =>
      tier.overlapFields.includes(key),
    ) &&
    planQuery(tier.indexes, query, tier.extras) !== null
  );
}

const tiers = new WeakMap<IndexedGridDef, Tier>();

export function isQueryRunnable(
  def: IndexedGridDef,
  query: QueryState,
): boolean {
  const tier =
    tiers.get(def) ??
    createTier(def.indexes, def, listSearchFields(def), def.fields);
  tiers.set(def, tier);
  return isTierRunnable(tier, query);
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

function describeBasis(
  indexes: IndexDef[],
  query: QueryState,
  extras: IndexExtras,
): string {
  const plan = planQuery(indexes, query, extras);
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
    query.texts,
    Object.entries(query.overlaps).sort(),
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
    !isMatchAny(query) &&
    !hasTextOrOverlap(query) &&
    Object.entries(query.equals).every(
      ([key, values]) =>
        key === facetField &&
        !values.includes(EMPTY_VALUE) &&
        !values.includes(NOT_EMPTY_VALUE),
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
        (planQuery(indexes, query, extras)?.narrowed ?? false)),
    narrowBasis: (query) => describeBasis(indexes, query, extras),
    equalsFields: listEqualsFields(indexes),
    rangeFields: tier?.rangeFields ?? listRangeFields(indexes),
    textFields: tier?.textFields ?? [],
    overlapFields: tier?.overlapFields ?? [],
    groupFields: tier?.groupFields ?? [],
    sortFields: listSortFields(indexes),
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
