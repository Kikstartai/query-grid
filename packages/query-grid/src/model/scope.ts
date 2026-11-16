import type { DataSource } from "./data-source.ts";
import type { QueryState, RangeState, TextState } from "./field-types.ts";

export interface QueryScope {
  equals?: Record<string, string[]>;
  ranges?: RangeState[];
  texts?: TextState[];
  overlaps?: Record<string, string[]>;
}

type Merge<T> = (value: T) => T;

function remember<T>(merge: Merge<T>): Merge<T> {
  let seen: T | null = null;
  let merged: T | null = null;
  return (value) => {
    if (seen !== value || merged === null) {
      seen = value;
      merged = merge(value);
    }
    return merged;
  };
}

function listScoped(scope: QueryScope): string[] {
  return [
    ...Object.keys(scope.equals ?? {}),
    ...Object.keys(scope.overlaps ?? {}),
  ];
}

export function isScopeEmpty(scope: QueryScope): boolean {
  return (
    listScoped(scope).length === 0 &&
    (scope.ranges ?? []).length === 0 &&
    (scope.texts ?? []).length === 0
  );
}

// The merged parts keep their identity while the user's parts do, so a source that caches by filter identity still hits.
function createScoper(scope: QueryScope): Merge<QueryState> {
  const equals = remember<QueryState["equals"]>((own) => ({
    ...own,
    ...scope.equals,
  }));
  const overlaps = remember<QueryState["overlaps"]>((own) => ({
    ...own,
    ...scope.overlaps,
  }));
  const ranges = remember<RangeState[]>((own) => [
    ...(scope.ranges ?? []),
    ...own,
  ]);
  const texts = remember<TextState[]>((own) => [
    ...(scope.texts ?? []),
    ...own,
  ]);
  return (query) => ({
    ...query,
    equals: equals(query.equals),
    overlaps: overlaps(query.overlaps),
    ranges: ranges(query.ranges),
    texts: texts(query.texts),
    match: "all",
  });
}

export function applyScope(query: QueryState, scope: QueryScope): QueryState {
  return createScoper(scope)(query);
}

// A scope is ANDed with whatever the user picks, so Match any is withdrawn: it would OR the scope away.
export function withScope(source: DataSource, scope: QueryScope): DataSource {
  if (isScopeEmpty(scope)) {
    return source;
  }
  const { capabilities } = source;
  const scoped = listScoped(scope);
  const apply = createScoper(scope);
  const isOwn = (query: QueryState) =>
    query.match !== "any" &&
    [...Object.keys(query.equals), ...Object.keys(query.overlaps)].every(
      (key) => !scoped.includes(key),
    );
  const free = (keys: string[]) => keys.filter((key) => !scoped.includes(key));
  return {
    ...source,
    capabilities: {
      ...capabilities,
      matchAny: false,
      equalsFields: free(capabilities.equalsFields),
      overlapFields: free(capabilities.overlapFields),
      groupFields: free(capabilities.groupFields),
      canRun: (query) => isOwn(query) && capabilities.canRun(apply(query)),
      isNarrowed: (query) => capabilities.isNarrowed(apply(query)),
      narrowBasis: (query) => capabilities.narrowBasis(apply(query)),
      isFacetCountExact: (query) =>
        capabilities.facetCountsFollowFilters &&
        capabilities.isFacetCountExact(apply(query)),
    },
    fetchPage: (query, limit, signal) =>
      source.fetchPage(apply(query), limit, signal),
    fetchCount: (query, exact, signal) =>
      source.fetchCount(apply(query), exact, signal),
    fetchTotals: (query, signal) => source.fetchTotals(apply(query), signal),
    fetchFacets: async (query, signal) =>
      capabilities.facetCountsFollowFilters
        ? source.fetchFacets(apply(query), signal)
        : [],
    fetchGroups: (query, signal) => source.fetchGroups(apply(query), signal),
    fetchNarrowed: (query, signal) =>
      source.fetchNarrowed(apply(query), signal),
  };
}
