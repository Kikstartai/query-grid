import { mapSourceQueries, type DataSource } from "./data-source.ts";
import type { Filter, QueryState } from "./query-state.ts";

export interface QueryScope {
  filters?: Filter[];
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
  return [...new Set((scope.filters ?? []).map((filter) => filter.field))];
}

export function isScopeEmpty(scope: QueryScope): boolean {
  return (scope.filters ?? []).length === 0;
}

// The merged filters keep their identity while the user's do, so a source that caches by filter identity still hits.
function createScoper(scope: QueryScope): Merge<QueryState> {
  const filters = remember<Filter[]>((own) => [
    ...(scope.filters ?? []),
    ...own,
  ]);
  return (query) => ({
    ...query,
    filters: filters(query.filters),
    combine: "and",
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
    query.combine !== "or" &&
    query.filters.every((filter) => !scoped.includes(filter.field));
  return {
    ...mapped,
    capabilities: {
      ...capabilities,
      combineOr: false,
      filterOps: Object.fromEntries(
        Object.entries(capabilities.filterOps).filter(
          ([key]) => !scoped.includes(key),
        ),
      ),
      groupFields: capabilities.groupFields.filter(
        (key) => !scoped.includes(key),
      ),
      canRun: (query) => isOwn(query) && capabilities.canRun(query),
      isFacetCountExact: (query) =>
        facetCountsFollowFilters && capabilities.isFacetCountExact(query),
    },
    fetchFacets: async (query, signal) =>
      facetCountsFollowFilters ? mapped.fetchFacets(query, signal) : [],
  };
}
