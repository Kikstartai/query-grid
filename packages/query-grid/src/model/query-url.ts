import {
  isDefaultSort,
  type BaseGridDef,
  type Capabilities,
  type QueryState,
  type RangeState,
  type SortDirection,
} from "./field-types.ts";

const EQUALS_PREFIX = "f.";
const RANGE_PREFIX = "r.";
const SEARCH_PARAM = "q";
const SORT_PARAM = "sort";
const CURSOR_PARAM = "cursor";
const RANGE_SEPARATOR = "..";

export interface QueryKey {
  name: string;
  repeated: boolean;
}

export function listQueryKeys(capabilities: Capabilities): QueryKey[] {
  const equals = capabilities.equalsFields.map(
    (key) => `${EQUALS_PREFIX}${key}`,
  );
  const ranges = capabilities.rangeFields.map((key) => `${RANGE_PREFIX}${key}`);
  return [
    ...equals.map((name) => ({ name, repeated: true })),
    ...[...ranges, SEARCH_PARAM, SORT_PARAM, CURSOR_PARAM].map((name) => ({
      name,
      repeated: false,
    })),
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
  if (query.range) {
    params.set(
      `${RANGE_PREFIX}${query.range.field}`,
      `${query.range.min ?? ""}${RANGE_SEPARATOR}${query.range.max ?? ""}`,
    );
  }
  if (query.search !== null) {
    params.set(SEARCH_PARAM, query.search);
  }
  if (!isDefaultSort(def, query.sort)) {
    params.set(SORT_PARAM, `${query.sort.field}.${query.sort.direction}`);
  }
  if (query.cursor) {
    params.set(CURSOR_PARAM, query.cursor);
  }
  return params;
}

function decodeRange(field: string, raw: string): RangeState {
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
  let range: RangeState | null = null;
  for (const [name, value] of params) {
    if (name.startsWith(EQUALS_PREFIX)) {
      const field = name.slice(EQUALS_PREFIX.length);
      const values = equals.get(field) ?? [];
      equals.set(field, values.includes(value) ? values : [...values, value]);
    }
    if (name.startsWith(RANGE_PREFIX)) {
      range = decodeRange(name.slice(RANGE_PREFIX.length), value);
    }
  }
  return {
    equals: Object.fromEntries(equals),
    range,
    search: params.get(SEARCH_PARAM),
    sort: decodeSort(def, params.get(SORT_PARAM)),
    cursor: params.get(CURSOR_PARAM),
  };
}
