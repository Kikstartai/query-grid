import type { DataSource } from "./data-source.ts";
import { isDatePreset, resolveDatePreset } from "./date-presets.ts";
import {
  getField,
  type BaseGridDef,
  type QueryState,
  type RangeState,
} from "./field-types.ts";
import { expandEquals, isExcluding } from "./field-values.ts";

export type Clock = () => Date;

export interface SourceOptions {
  now?: Clock;
}

function resolveEquals(
  def: BaseGridDef,
  equals: QueryState["equals"],
): QueryState["equals"] {
  const entries = Object.entries(equals);
  const excluding = entries.some(([key, values]) => {
    const field = getField(def, key);
    return field !== null && isExcluding(field, values);
  });
  if (!excluding) {
    return equals;
  }
  return Object.fromEntries(
    entries.map(([key, values]) => {
      const field = getField(def, key);
      return [key, field ? expandEquals(field, values) : values];
    }),
  );
}

function resolveRange(
  def: BaseGridDef,
  range: RangeState,
  now: Date | null,
): RangeState {
  const { field, preset } = range;
  if (preset === undefined) {
    return range;
  }
  if (!isDatePreset(preset) || getField(def, field)?.type !== "datetime") {
    return range;
  }
  if (now === null) {
    return { field, min: null, max: null };
  }
  return { field, ...resolveDatePreset(preset, now) };
}

function resolveRanges(
  def: BaseGridDef,
  ranges: RangeState[],
  now: Date | null,
): RangeState[] {
  if (ranges.every((range) => range.preset === undefined)) {
    return ranges;
  }
  return ranges.map((range) => resolveRange(def, range, now));
}

export function resolveQuery(
  def: BaseGridDef,
  query: QueryState,
  now: Date | null,
): QueryState {
  const equals = resolveEquals(def, query.equals);
  const ranges = resolveRanges(def, query.ranges, now);
  if (equals === query.equals && ranges === query.ranges) {
    return query;
  }
  return { ...query, equals, ranges };
}

interface Resolved {
  equals: QueryState["equals"];
  ranges: RangeState[];
  day: string;
  query: QueryState;
}

function createResolver(
  def: BaseGridDef,
  now: Clock,
): (query: QueryState) => QueryState {
  let last: Resolved | null = null;
  return (query) => {
    const at = now();
    const day = at.toDateString();
    const fresh =
      last !== null &&
      last.equals === query.equals &&
      last.ranges === query.ranges &&
      last.day === day;
    if (!fresh) {
      last = {
        equals: query.equals,
        ranges: query.ranges,
        day,
        query: resolveQuery(def, query, at),
      };
    }
    const { equals, ranges } = (last as Resolved).query;
    return equals === query.equals && ranges === query.ranges
      ? query
      : { ...query, equals, ranges };
  };
}

export function withQueryResolution(
  def: BaseGridDef,
  source: DataSource,
  options: SourceOptions = {},
): DataSource {
  const resolve = createResolver(def, options.now ?? (() => new Date()));
  const shape = (query: QueryState) => resolveQuery(def, query, null);
  return {
    ...source,
    runnable: {
      ...source.runnable,
      canRun: (query) => source.runnable.canRun(shape(query)),
      isFacetCountExact: (query) =>
        source.runnable.isFacetCountExact(shape(query)),
    },
    fetchPage: (query, limit, signal) =>
      source.fetchPage(resolve(query), limit, signal),
    fetchCount: (query, exact, signal) =>
      source.fetchCount(resolve(query), exact, signal),
    fetchTotals: (query, signal) => source.fetchTotals(resolve(query), signal),
    fetchFacets: (query, signal) => source.fetchFacets(resolve(query), signal),
  };
}
