import { isDatePreset } from "./date-presets.ts";
import {
  isDefaultSort,
  type BaseGridDef,
  type ContainsState,
  type RunnableQueries,
  type QueryState,
  type RangeState,
  type SortDirection,
} from "./field-types.ts";

const EQUALS_PREFIX = "f.";
const RANGE_PREFIX = "r.";
const CONTAINS_PREFIX = "c.";
const MATCH_PARAM = "match";
const GROUP_PARAM = "group";
const SEARCH_PARAM = "q";
const SORT_PARAM = "sort";
const CURSOR_PARAM = "cursor";
const RANGE_SEPARATOR = "..";

export interface QueryKey {
  name: string;
  repeated: boolean;
}

export function listQueryKeys(runnable: RunnableQueries): QueryKey[] {
  const equals = runnable.equalsFields.map((key) => `${EQUALS_PREFIX}${key}`);
  const ranges = runnable.rangeFields.map((key) => `${RANGE_PREFIX}${key}`);
  const contains = runnable.containsFields.map(
    (key) => `${CONTAINS_PREFIX}${key}`,
  );
  const match = runnable.matchAny ? [MATCH_PARAM] : [];
  const group = runnable.groupFields.length > 0 ? [GROUP_PARAM] : [];
  return [
    ...equals.map((name) => ({ name, repeated: true })),
    ...[
      ...ranges,
      ...contains,
      ...match,
      ...group,
      SEARCH_PARAM,
      SORT_PARAM,
      CURSOR_PARAM,
    ].map((name) => ({ name, repeated: false })),
  ];
}

export function encodeQuery(
  def: BaseGridDef,
  query: QueryState,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [field, values] of Object.entries(query.equals)) {
    for (const value of values) {
      params.append(`${EQUALS_PREFIX}${field}`, value);
    }
  }
  for (const range of query.ranges) {
    params.set(
      `${RANGE_PREFIX}${range.field}`,
      range.preset ?? `${range.min ?? ""}${RANGE_SEPARATOR}${range.max ?? ""}`,
    );
  }
  if (query.contains) {
    params.set(
      `${CONTAINS_PREFIX}${query.contains.field}`,
      query.contains.value,
    );
  }
  if (query.match === "any") {
    params.set(MATCH_PARAM, "any");
  }
  if (query.search !== null) {
    params.set(SEARCH_PARAM, query.search);
  }
  if (!isDefaultSort(def, query.sort)) {
    params.set(SORT_PARAM, `${query.sort.field}.${query.sort.direction}`);
  }
  if (query.group !== null) {
    params.set(GROUP_PARAM, query.group);
  }
  if (query.cursor) {
    params.set(CURSOR_PARAM, query.cursor);
  }
  return params;
}

function decodeRange(field: string, raw: string): RangeState {
  if (isDatePreset(raw)) {
    return { field, min: null, max: null, preset: raw };
  }
  const at = raw.indexOf(RANGE_SEPARATOR);
  const min = at < 0 ? raw : raw.slice(0, at);
  const max = at < 0 ? "" : raw.slice(at + RANGE_SEPARATOR.length);
  return { field, min: min || null, max: max || null };
}

function decodeSort(def: BaseGridDef, raw: string | null): QueryState["sort"] {
  if (!raw) {
    return def.defaultSort;
  }
  const at = raw.lastIndexOf(".");
  const direction: SortDirection = raw.slice(at + 1) === "asc" ? "asc" : "desc";
  return { field: at < 0 ? raw : raw.slice(0, at), direction };
}

export function decodeQuery(
  def: BaseGridDef,
  params: URLSearchParams,
): QueryState {
  const equals = new Map<string, string[]>();
  const ranges = new Map<string, RangeState>();
  let contains: ContainsState | null = null;
  for (const [name, value] of params) {
    if (name.startsWith(EQUALS_PREFIX)) {
      const field = name.slice(EQUALS_PREFIX.length);
      const values = equals.get(field) ?? [];
      equals.set(field, values.includes(value) ? values : [...values, value]);
    }
    if (name.startsWith(RANGE_PREFIX)) {
      const field = name.slice(RANGE_PREFIX.length);
      ranges.set(field, decodeRange(field, value));
    }
    if (name.startsWith(CONTAINS_PREFIX) && contains === null) {
      contains = { field: name.slice(CONTAINS_PREFIX.length), value };
    }
  }
  return {
    equals: Object.fromEntries(equals),
    ranges: [...ranges.values()],
    contains,
    match: params.get(MATCH_PARAM) === "any" ? "any" : "all",
    search: params.get(SEARCH_PARAM),
    sort: decodeSort(def, params.get(SORT_PARAM)),
    group: params.get(GROUP_PARAM),
    cursor: params.get(CURSOR_PARAM),
  };
}
