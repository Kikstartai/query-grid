import { mapSourceQueries, type DataSource } from "./data-source.ts";
import type { QueryState, RangeState, TextState } from "./query-state.ts";

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
  const { facetCountsFollowFilters } = source.capabilities;
  const scoped = listScoped(scope);
  // The checks get a scoper of their own: an offer probes many queries, and each would push the fetches' merged filters out of the one that remembers them.
  const mapped = mapSourceQueries(source, {
    fetch: createScoper(scope),
    check: createScoper(scope),
  });
  const { capabilities } = mapped;
  const isOwn = (query: QueryState) =>
    query.match !== "any" &&
    listScoped(query).every((key) => !scoped.includes(key));
  const free = (keys: string[]) => keys.filter((key) => !scoped.includes(key));
  return {
    ...mapped,
    capabilities: {
      ...capabilities,
      matchAny: false,
      equalsFields: free(capabilities.equalsFields),
      overlapFields: free(capabilities.overlapFields),
      groupFields: free(capabilities.groupFields),
      canRun: (query) => isOwn(query) && capabilities.canRun(query),
      isFacetCountExact: (query) =>
        facetCountsFollowFilters && capabilities.isFacetCountExact(query),
    },
    fetchFacets: async (query, signal) =>
      facetCountsFollowFilters ? mapped.fetchFacets(query, signal) : [],
  };
}
