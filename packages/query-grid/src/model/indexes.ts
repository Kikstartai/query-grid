import {
  listSearchFields,
  type BaseGridDef,
  type RunnableQueries,
  type QueryState,
} from "./field-types.ts";

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

export function getIndex(
  indexes: IndexDef[],
  query: QueryState,
): IndexDef | null {
  const equals = Object.keys(query.equals);
  if (query.search !== null) {
    return null;
  }
  const ordered = indexes.find(
    (index) => index.sort === query.sort.field && sameSet(index.equals, equals),
  );
  if (!ordered) {
    return null;
  }
  if (query.range && (!ordered.range || query.range.field !== ordered.sort)) {
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
  return (
    searchFields.length > 0 &&
    Object.keys(query.equals).length === 0 &&
    query.range === null &&
    listSortFields(indexes).includes(query.sort.field)
  );
}

export function isFacetOnlyQuery(
  facetField: string | undefined,
  query: QueryState,
): boolean {
  return (
    facetField !== undefined &&
    query.range === null &&
    query.search === null &&
    Object.keys(query.equals).every((key) => key === facetField)
  );
}

export function indexRunnable(
  indexes: IndexDef[],
  options: IndexRunnableOptions = {},
): RunnableQueries {
  const searchFields = options.searchFields ?? [];
  return {
    mode: "server",
    canRun: (query) => isQueryIndexed(indexes, searchFields, query),
    equalsFields: listEqualsFields(indexes),
    rangeFields: listRangeFields(indexes),
    sortFields: listSortFields(indexes),
    searchFields,
    isFacetCountExact: (query) => isFacetOnlyQuery(options.facetField, query),
  };
}

export function gridDefRunnable(def: IndexedGridDef): RunnableQueries {
  return indexRunnable(def.indexes, {
    facetField: def.facet?.field,
    searchFields: listSearchFields(def),
  });
}
