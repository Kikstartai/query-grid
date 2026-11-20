import { isDatePreset } from "./date-presets.ts";
import { toRange } from "./range-bounds.ts";
import {
  isDefaultSort,
  type BaseGridDef,
  type SortDirection,
  type SortState,
} from "./grid-def.ts";
import {
  listSorts,
  listThenBy,
  TEXT_OPS,
  withThenBy,
  type QueryState,
  type RangeState,
  type TextOp,
  type TextState,
} from "./query-state.ts";
import type { DataSourceCapabilities } from "./capabilities.ts";

const EQUALS_PREFIX = "f.";
const OVERLAP_PREFIX = "o.";
const RANGE_PREFIX = "r.";
const TEXT_PREFIXES: Record<TextOp, string> = {
  contains: "c.",
  not_contains: "nc.",
  starts_with: "sw.",
  ends_with: "ew.",
  not_equals: "ne.",
};
const MATCH_PARAM = "match";
const GROUP_PARAM = "group";
const SEARCH_PARAM = "q";
const SORT_PARAM = "sort";
const CURSOR_PARAM = "cursor";
const SORT_SEPARATOR = ",";
const RANGE_SEPARATOR = "..";
const EXCLUDE_MARK = "!";
const OPEN_MIN_MARK = "(";
const OPEN_MAX_MARK = ")";

export interface QueryKey {
  name: string;
  repeated: boolean;
}

export function listQueryKeys(
  capabilities: DataSourceCapabilities,
): QueryKey[] {
  const repeated = [
    ...capabilities.equalsFields.map((key) => `${EQUALS_PREFIX}${key}`),
    ...capabilities.overlapFields.map((key) => `${OVERLAP_PREFIX}${key}`),
    ...capabilities.rangeFields.map((key) => `${RANGE_PREFIX}${key}`),
    ...capabilities.textFields.flatMap((key) =>
      TEXT_OPS.map((op) => `${TEXT_PREFIXES[op]}${key}`),
    ),
  ];
  const combine = capabilities.combineOr ? [MATCH_PARAM] : [];
  const group = capabilities.groupFields.length > 0 ? [GROUP_PARAM] : [];
  return [
    ...repeated.map((name) => ({ name, repeated: true })),
    ...[...combine, ...group, SEARCH_PARAM, SORT_PARAM, CURSOR_PARAM].map(
      (name) => ({ name, repeated: false }),
    ),
  ];
}

function encodeRange(range: RangeState): string {
  if (range.preset !== undefined) {
    return range.preset;
  }
  return [
    range.exclude ? EXCLUDE_MARK : "",
    range.minExclusive && range.min !== null ? OPEN_MIN_MARK : "",
    range.min ?? "",
    RANGE_SEPARATOR,
    range.max ?? "",
    range.maxExclusive && range.max !== null ? OPEN_MAX_MARK : "",
  ].join("");
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
  for (const [field, values] of Object.entries(query.overlaps)) {
    for (const value of values) {
      params.append(`${OVERLAP_PREFIX}${field}`, value);
    }
  }
  for (const range of query.ranges) {
    params.append(`${RANGE_PREFIX}${range.field}`, encodeRange(range));
  }
  for (const text of query.texts) {
    params.append(`${TEXT_PREFIXES[text.op]}${text.field}`, text.value);
  }
  if (query.combine === "or") {
    params.set(MATCH_PARAM, "any");
  }
  if (query.search !== null) {
    params.set(SEARCH_PARAM, query.search);
  }
  if (!isDefaultSort(def, query.sort) || listThenBy(query).length > 0) {
    params.set(
      SORT_PARAM,
      listSorts(query)
        .map((sort) => `${sort.field}.${sort.direction}`)
        .join(SORT_SEPARATOR),
    );
  }
  if (query.group !== null) {
    params.set(GROUP_PARAM, query.group);
  }
  if (query.cursor !== null) {
    params.set(CURSOR_PARAM, query.cursor);
  }
  return params;
}

function strip(raw: string, mark: string, end: boolean): string {
  if (end) {
    return raw.endsWith(mark) ? raw.slice(0, -mark.length) : raw;
  }
  return raw.startsWith(mark) ? raw.slice(mark.length) : raw;
}

function decodeRange(field: string, raw: string): RangeState {
  if (isDatePreset(raw)) {
    return { field, min: null, max: null, preset: raw };
  }
  const included = strip(raw, EXCLUDE_MARK, false);
  const closedMin = strip(included, OPEN_MIN_MARK, false);
  const body = strip(closedMin, OPEN_MAX_MARK, true);
  const at = body.indexOf(RANGE_SEPARATOR);
  const min = (at < 0 ? body : body.slice(0, at)) || null;
  const max = (at < 0 ? "" : body.slice(at + RANGE_SEPARATOR.length)) || null;
  return toRange(field, {
    min,
    max,
    exclude: included !== raw,
    minExclusive: closedMin !== included,
    maxExclusive: body !== closedMin,
  });
}

function decodeSortKey(raw: string): SortState {
  const at = raw.lastIndexOf(".");
  const direction: SortDirection = raw.slice(at + 1) === "asc" ? "asc" : "desc";
  return { field: at < 0 ? raw : raw.slice(0, at), direction };
}

function decodeSorts(def: BaseGridDef, raw: string | null): SortState[] {
  const keys = (raw ?? "").split(SORT_SEPARATOR).filter(Boolean);
  return keys.length > 0 ? keys.map(decodeSortKey) : [def.defaultSort];
}

function addValue(
  record: Map<string, string[]>,
  field: string,
  value: string,
): void {
  const values = record.get(field) ?? [];
  record.set(field, values.includes(value) ? values : [...values, value]);
}

function decodeText(name: string, value: string): TextState | null {
  const op = TEXT_OPS.find((item) => name.startsWith(TEXT_PREFIXES[item]));
  return op ? { field: name.slice(TEXT_PREFIXES[op].length), op, value } : null;
}

export function decodeQuery(
  def: BaseGridDef,
  params: URLSearchParams,
): QueryState {
  const equals = new Map<string, string[]>();
  const overlaps = new Map<string, string[]>();
  const ranges: RangeState[] = [];
  const texts: TextState[] = [];
  const seen = new Set<string>();
  for (const [name, value] of params) {
    const pair = `${name}\u0000${value}`;
    if (seen.has(pair)) {
      continue;
    }
    seen.add(pair);
    if (name.startsWith(EQUALS_PREFIX)) {
      addValue(equals, name.slice(EQUALS_PREFIX.length), value);
      continue;
    }
    if (name.startsWith(OVERLAP_PREFIX)) {
      addValue(overlaps, name.slice(OVERLAP_PREFIX.length), value);
      continue;
    }
    if (name.startsWith(RANGE_PREFIX)) {
      const field = name.slice(RANGE_PREFIX.length);
      ranges.push(decodeRange(field, value));
      continue;
    }
    const text = decodeText(name, value);
    if (text) {
      texts.push(text);
    }
  }
  const [sort, ...thenBy] = decodeSorts(def, params.get(SORT_PARAM));
  return withThenBy(
    {
      equals: Object.fromEntries(equals),
      ranges,
      texts,
      overlaps: Object.fromEntries(overlaps),
      combine: params.get(MATCH_PARAM) === "any" ? "or" : "and",
      search: params.get(SEARCH_PARAM),
      sort,
      group: params.get(GROUP_PARAM),
      cursor: params.get(CURSOR_PARAM),
    },
    thenBy,
  );
}
