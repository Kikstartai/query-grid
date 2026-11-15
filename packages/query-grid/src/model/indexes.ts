import {
  listQuickFields,
  type BaseGridDef,
  type Capabilities,
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

export interface IndexCapabilityOptions {
  facetField?: string;
  quickFields?: string[];
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
  if (query.quick !== null) {
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
  quickFields: string[],
  query: QueryState,
): boolean {
  if (query.quick === null) {
    return getIndex(indexes, query) !== null;
  }
  return (
    quickFields.length > 0 &&
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
    query.quick === null &&
    Object.keys(query.equals).every((key) => key === facetField)
  );
}

export function indexCapabilities(
  indexes: IndexDef[],
  options: IndexCapabilityOptions = {},
): Capabilities {
  const quickFields = options.quickFields ?? [];
  return {
    mode: "server",
    isAnswerable: (query) => isQueryIndexed(indexes, quickFields, query),
    equalsFields: listEqualsFields(indexes),
    rangeFields: listRangeFields(indexes),
    sortFields: listSortFields(indexes),
    quickFields,
    isFacetCountShown: (query) => isFacetOnlyQuery(options.facetField, query),
  };
}

export function gridDefCapabilities(def: IndexedGridDef): Capabilities {
  return indexCapabilities(def.indexes, {
    facetField: def.facet?.field,
    quickFields: listQuickFields(def),
  });
}
