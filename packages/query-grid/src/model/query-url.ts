import {
  isDefaultSort,
  type GridDef,
  type QueryState,
  type RangeState,
  type SortDirection,
} from "./field-types.ts";

const EQUALS_PREFIX = "f.";
const RANGE_PREFIX = "r.";
const QUICK_PARAM = "q";
const RANGE_SEPARATOR = "..";

export function encodeQuery(def: GridDef, query: QueryState): URLSearchParams {
  const params = new URLSearchParams();
  for (const [field, value] of Object.entries(query.equals)) {
    params.set(`${EQUALS_PREFIX}${field}`, value);
  }
  if (query.range) {
    params.set(
      `${RANGE_PREFIX}${query.range.field}`,
      `${query.range.min ?? ""}${RANGE_SEPARATOR}${query.range.max ?? ""}`,
    );
  }
  if (query.quick !== null) {
    params.set(QUICK_PARAM, query.quick);
  }
  if (!isDefaultSort(def, query.sort)) {
    params.set("sort", `${query.sort.field}.${query.sort.direction}`);
  }
  if (query.cursor) {
    params.set("cursor", query.cursor);
  }
  return params;
}

function decodeRange(field: string, raw: string): RangeState {
  const at = raw.indexOf(RANGE_SEPARATOR);
  const min = at < 0 ? raw : raw.slice(0, at);
  const max = at < 0 ? "" : raw.slice(at + RANGE_SEPARATOR.length);
  return { field, min: min || null, max: max || null };
}

function decodeSort(def: GridDef, raw: string | null): QueryState["sort"] {
  if (!raw) {
    return def.defaultSort;
  }
  const at = raw.lastIndexOf(".");
  const direction: SortDirection = raw.slice(at + 1) === "asc" ? "asc" : "desc";
  return { field: at < 0 ? raw : raw.slice(0, at), direction };
}

export function decodeQuery(def: GridDef, params: URLSearchParams): QueryState {
  const equals: Record<string, string> = {};
  let range: RangeState | null = null;
  for (const [name, value] of params) {
    if (name.startsWith(EQUALS_PREFIX)) {
      equals[name.slice(EQUALS_PREFIX.length)] = value;
    }
    if (name.startsWith(RANGE_PREFIX)) {
      range = decodeRange(name.slice(RANGE_PREFIX.length), value);
    }
  }
  return {
    equals,
    range,
    quick: params.get(QUICK_PARAM),
    sort: decodeSort(def, params.get("sort")),
    cursor: params.get("cursor"),
  };
}
