import type { DataSourceCapabilities } from "./capabilities.ts";
import { mapSourceQueries, type DataSource } from "./data-source.ts";
import { expandNoneOf, resolvePeriod } from "./filter-values.ts";
import { getField, type BaseGridDef } from "./grid-def.ts";
import {
  FILTER_OPS,
  isLiteralOp,
  listFieldOps,
  type FilterOp,
} from "./operators.ts";
import type { Filter, QueryState } from "./query-state.ts";

const REFERENCE_DAY = new Date(2000, 0, 1);

type PeriodMode = Date | "name";

function resolveFilter(
  def: BaseGridDef,
  filter: Filter,
  mode: PeriodMode,
): Filter {
  const field = getField(def, filter.field);
  if (!field || !isLiteralOp(field, filter.op)) {
    return filter;
  }
  if (filter.op === "none_of") {
    return expandNoneOf(field, filter);
  }
  if (filter.op !== "in_period") {
    return filter;
  }
  if (mode === "name") {
    return {
      field: filter.field,
      op: "between",
      min: filter.preset,
      max: filter.preset,
    };
  }
  return resolvePeriod(field, filter, mode);
}

function resolveFilters(
  def: BaseGridDef,
  query: QueryState,
  mode: PeriodMode,
): QueryState {
  const literal = query.filters.some((filter) => {
    const field = getField(def, filter.field);
    return field !== null && isLiteralOp(field, filter.op);
  });
  if (!literal) {
    return query;
  }
  return {
    ...query,
    filters: query.filters.map((filter) => resolveFilter(def, filter, mode)),
  };
}

// Without a clock a period is resolved against a fixed day: what is checked is the filter's shape, not which days it holds.
export function toLiteralQuery(
  def: BaseGridDef,
  query: QueryState,
  now: Date | null,
): QueryState {
  return resolveFilters(def, query, now ?? REFERENCE_DAY);
}

interface Resolved {
  filters: Filter[];
  day: string;
  query: QueryState;
}

function createResolver(def: BaseGridDef): (query: QueryState) => QueryState {
  let last: Resolved | null = null;
  return (query) => {
    const at = new Date();
    const day = at.toDateString();
    const fresh =
      last !== null && last.filters === query.filters && last.day === day;
    if (!fresh) {
      last = {
        filters: query.filters,
        day,
        query: toLiteralQuery(def, query, at),
      };
    }
    const { filters } = (last as Resolved).query;
    return filters === query.filters ? query : { ...query, filters };
  };
}

function listLiteralOps(
  def: BaseGridDef,
  key: string,
  ops: FilterOp[],
): FilterOp[] {
  const field = getField(def, key);
  if (!field) {
    return ops;
  }
  const added = listFieldOps(field).filter((op) => {
    if (!isLiteralOp(field, op)) {
      return false;
    }
    return ops.includes(op === "in_period" ? "between" : "any_of");
  });
  return FILTER_OPS.filter((op) => ops.includes(op) || added.includes(op));
}

function withLiteralOps(
  def: BaseGridDef,
  capabilities: DataSourceCapabilities,
): DataSourceCapabilities {
  return {
    ...capabilities,
    filterOps: Object.fromEntries(
      Object.entries(capabilities.filterOps).map(([key, ops]) => [
        key,
        listLiteralOps(def, key, ops),
      ]),
    ),
  };
}

export function withLiteralFilters(
  def: BaseGridDef,
  source: DataSource,
): DataSource {
  const mapped = mapSourceQueries(source, {
    fetch: createResolver(def),
    check: (query) => toLiteralQuery(def, query, null),
    basis: (query) => resolveFilters(def, query, "name"),
  });
  return { ...mapped, capabilities: withLiteralOps(def, mapped.capabilities) };
}
