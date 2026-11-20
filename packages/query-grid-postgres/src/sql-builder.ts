import {
  checkFilterOps,
  DEFAULT_LIMITS,
  formatProblem,
  getField,
  GROUP_LIMIT,
  isCombineOr,
  isPointBounds,
  isNumberType,
  isQueryBudgeted,
  isQueryRunnable,
  isValidFieldValue,
  KEY_FIELD,
  listSearchFields,
  listSorts,
  PAGE_LIMIT_MAX,
  planQuery,
  resolveFieldKind,
  toFilterBounds,
  validateQueryValues,
  type BaseFieldDef,
  type FieldType,
  type Filter,
  type FilterBounds,
  type FilterOp,
  type GridLimits,
  type GridRow,
  type PageResult,
  type ProblemParams,
  type QueryState,
  type SortDirection,
} from "@kikstart/query-grid";

import { decodeCursor, encodeCursor } from "./cursor.ts";
import type { PostgresGridDef } from "./storage.ts";

export type SqlValue = string | string[];

export interface SqlQuery {
  text: string;
  values: SqlValue[];
}

export type RejectionCode =
  | "unindexed_query"
  | "invalid_value"
  | "invalid_cursor"
  | "invalid_limit"
  | "too_broad"
  | "narrow_first"
  | "export_too_large"
  | "transition_refused"
  | "not_found";

export class QueryRejected extends Error {
  readonly error: RejectionCode;
  readonly code: string;
  readonly params: ProblemParams;

  constructor(
    error: RejectionCode,
    code: string = error,
    params: ProblemParams = {},
  ) {
    super(formatProblem(code, params));
    this.error = error;
    this.code = code;
    this.params = params;
  }
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export const IDENTIFIER_MAX_LENGTH = 63;

const HASH_LENGTH = 8;

const SQL_CASTS: Record<FieldType, string> = {
  id: "uuid",
  text: "text",
  enum: "text",
  integer: "bigint",
  decimal: "numeric",
  money: "bigint",
  boolean: "boolean",
  date: "date",
  datetime: "timestamptz",
  array: "text",
};

const TABLE_ALIAS = "t";

export function identifier(name: string): string {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`"${name}" is not a plain SQL identifier`);
  }
  return name;
}

function hashName(name: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index++) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(HASH_LENGTH, "0");
}

export function shortenIdentifier(name: string): string {
  if (name.length <= IDENTIFIER_MAX_LENGTH) {
    return name;
  }
  const kept = IDENTIFIER_MAX_LENGTH - HASH_LENGTH - 1;
  return `${name.slice(0, kept)}_${hashName(name)}`;
}

export function sumColumn(field: string): string {
  return shortenIdentifier(`${identifier(field)}_sum`);
}

function column(name: string): string {
  return `${TABLE_ALIAS}.${identifier(name)}`;
}

function from(def: PostgresGridDef): string {
  return `${identifier(def.table)} ${TABLE_ALIAS}`;
}

function selectExpression(field: BaseFieldDef): string {
  const name = column(field.key);
  const alias = identifier(field.key);
  if (field.type === "datetime") {
    return `to_char(${name} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ${alias}`;
  }
  if (field.type === "date") {
    return `to_char(${name}, 'YYYY-MM-DD') AS ${alias}`;
  }
  if (isNumberType(field.type)) {
    return `${name}::float8 AS ${alias}`;
  }
  return name;
}

function requireField(def: PostgresGridDef, key: string): BaseFieldDef {
  const field = getField(def, key);
  if (!field) {
    throw new QueryRejected("unindexed_query", "unknown_field", {
      field: key,
    });
  }
  return field;
}

function searchPart(field: BaseFieldDef, prefix: string): string {
  const name = `${prefix}${identifier(field.key)}`;
  const text =
    field.type === "text" || field.type === "enum" ? name : `${name}::text`;
  return field.nullable ? `coalesce(${text}, '')` : text;
}

export function searchExpression(def: PostgresGridDef, prefix = ""): string {
  return listSearchFields(def)
    .map((key) => searchPart(requireField(def, key), prefix))
    .join(" || ' ' || ");
}

export function assertDeclared(def: PostgresGridDef, query: QueryState): void {
  const refused = checkFilterOps(def, query);
  if (refused) {
    throw new QueryRejected("invalid_value", refused.code, refused.params);
  }
  if (!isQueryRunnable(def, query)) {
    throw new QueryRejected("unindexed_query");
  }
  const problem = validateQueryValues(def, query);
  if (problem) {
    throw new QueryRejected("invalid_value", problem.code, problem.params);
  }
}

class Params {
  readonly values: SqlValue[] = [];

  addList(values: string[], field: BaseFieldDef): string {
    this.values.push(values);
    return `$${this.values.length}::${SQL_CASTS[field.type]}[]`;
  }

  add(value: string, field: BaseFieldDef): string {
    this.values.push(value);
    return `$${this.values.length}::${SQL_CASTS[field.type]}`;
  }

  addText(value: string): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function selectList(def: PostgresGridDef): string {
  return def.fields.map(selectExpression).join(", ");
}

interface Filtered {
  params: Params;
  clauses: string[];
}

function either(parts: string[]): string {
  return parts.length > 1 ? `(${parts.join(" OR ")})` : parts[0];
}

// An excluded range is written as the two sides outside it, never as NOT (…): each side stays a plain comparison, and an empty cell is outside every range.
function boundsClauses(
  field: BaseFieldDef,
  bounds: FilterBounds,
  params: Params,
): string[] {
  const name = column(field.key);
  if (isPointBounds(bounds) && bounds.min !== null) {
    const place = params.add(bounds.min, field);
    if (!bounds.outside) {
      return [`${name} = ${place}`];
    }
    const sides = [`${name} <> ${place}`];
    return [either(field.nullable ? [...sides, `${name} IS NULL`] : sides)];
  }
  const { outside } = bounds;
  const parts: string[] = [];
  if (bounds.min !== null) {
    const inside = bounds.minOpen ? ">" : ">=";
    const operator = outside ? (bounds.minOpen ? "<=" : "<") : inside;
    parts.push(`${name} ${operator} ${params.add(bounds.min, field)}`);
  }
  if (bounds.max !== null) {
    const inside = bounds.maxOpen ? "<" : "<=";
    const operator = outside ? (bounds.maxOpen ? ">=" : ">") : inside;
    parts.push(`${name} ${operator} ${params.add(bounds.max, field)}`);
  }
  if (!outside) {
    return parts;
  }
  return [either(field.nullable ? [...parts, `${name} IS NULL`] : parts)];
}

const LIKE_PATTERNS: Partial<Record<FilterOp, (value: string) => string>> = {
  contains: (value) => `%${value}%`,
  not_contains: (value) => `%${value}%`,
  starts_with: (value) => `${value}%`,
  ends_with: (value) => `%${value}`,
};

function textClause(
  field: BaseFieldDef,
  filter: Filter,
  params: Params,
): string {
  const name = column(field.key);
  const value = "value" in filter ? filter.value.trim() : "";
  if (filter.op === "equals") {
    return `${name} = ${params.addText(value)}`;
  }
  if (filter.op === "not_equals") {
    return `${name} IS DISTINCT FROM ${params.addText(value)}`;
  }
  const like = LIKE_PATTERNS[filter.op];
  if (!like) {
    throw new QueryRejected("invalid_value", "invalid_op", {
      field: filter.field,
      op: filter.op,
    });
  }
  const pattern = params.addText(like(escapeLike(value)));
  if (filter.op !== "not_contains") {
    return `${name} ILIKE ${pattern}`;
  }
  return field.nullable
    ? `(${name} NOT ILIKE ${pattern} OR ${name} IS NULL)`
    : `${name} NOT ILIKE ${pattern}`;
}

function blankClause(field: BaseFieldDef): string {
  const name = column(field.key);
  return field.type === "array"
    ? `(${name} IS NULL OR cardinality(${name}) = 0)`
    : `${name} IS NULL`;
}

function listReal(values: (string | null)[]): string[] {
  return values.flatMap((value) => (value === null ? [] : [value]));
}

function anyOfClause(
  field: BaseFieldDef,
  values: (string | null)[],
  params: Params,
): string {
  const name = column(field.key);
  const real = listReal(values);
  if (real.length === 0) {
    return blankClause(field);
  }
  const blank = real.length < values.length ? [blankClause(field)] : [];
  if (field.type === "array") {
    return either([`${name} && ${params.addList(real, field)}`, ...blank]);
  }
  const matches =
    real.length === 1
      ? `${name} = ${params.add(real[0], field)}`
      : `${name} = ANY(${params.addList(real, field)})`;
  return either([matches, ...blank]);
}

function noneOfClause(
  field: BaseFieldDef,
  values: (string | null)[],
  params: Params,
): string {
  const name = column(field.key);
  const real = listReal(values);
  const keepsBlank = real.length === values.length;
  if (real.length === 0) {
    return field.type === "array"
      ? `(${name} IS NOT NULL AND cardinality(${name}) > 0)`
      : `${name} IS NOT NULL`;
  }
  const list = params.addList(real, field);
  if (field.type === "array") {
    const outside = `NOT (${name} && ${list})`;
    if (!keepsBlank) {
      return `(${outside} AND cardinality(${name}) > 0)`;
    }
    return field.nullable ? `(${outside} OR ${name} IS NULL)` : outside;
  }
  const outside = `${name} <> ALL(${list})`;
  return keepsBlank && field.nullable
    ? `(${outside} OR ${name} IS NULL)`
    : outside;
}

function filterClauses(
  field: BaseFieldDef,
  item: Filter,
  params: Params,
): string[] {
  const name = column(field.key);
  switch (item.op) {
    case "blank":
      return [blankClause(field)];
    case "not_blank":
      return [`${name} IS NOT NULL`];
    case "any_of":
      return [anyOfClause(field, item.values, params)];
    case "none_of":
      return [noneOfClause(field, item.values, params)];
    case "all_of":
      return [`${name} @> ${params.addList(listReal(item.values), field)}`];
    default: {
      const bounds =
        resolveFieldKind(field) === "text" ? null : toFilterBounds(field, item);
      return bounds
        ? boundsClauses(field, bounds, params)
        : [textClause(field, item, params)];
    }
  }
}

function anyOf(terms: string[][]): string[] {
  const alternatives = terms
    .filter((parts) => parts.length > 0)
    .map((parts) => (parts.length > 1 ? `(${parts.join(" AND ")})` : parts[0]));
  return alternatives.length > 0 ? [`(${alternatives.join(" OR ")})`] : [];
}

function filter(def: PostgresGridDef, query: QueryState): Filtered {
  assertDeclared(def, query);
  const params = new Params();
  const terms = query.filters.map((item) =>
    filterClauses(requireField(def, item.field), item, params),
  );
  const clauses = isCombineOr(query) ? anyOf(terms) : terms.flat();
  if (query.search !== null) {
    const pattern = `%${escapeLike(query.search.trim())}%`;
    clauses.push(
      `(${searchExpression(def, `${TABLE_ALIAS}.`)}) ILIKE ${params.addText(pattern)}`,
    );
  }
  return { params, clauses };
}

function whereClause(clauses: string[]): string {
  return clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
}

function clampLimit(requested: number, limits: GridLimits): number {
  if (!Number.isFinite(requested) || requested < 1) {
    return limits.pageLimit;
  }
  return Math.min(Math.floor(requested), PAGE_LIMIT_MAX);
}

interface OrderKey {
  field: BaseFieldDef;
  direction: SortDirection;
}

const CURSOR_TEXT_MAX = 2000;
const CURSOR_NUMBER = /^-?\d{1,40}(\.\d{1,40})?(e[+-]?\d{1,3})?$/i;

// The key follows the first sort column, so one index read forward or backward gives the whole order.
function listOrderKeys(def: PostgresGridDef, query: QueryState): OrderKey[] {
  return [
    ...listSorts(query).map((sort) => ({
      field: requireField(def, sort.field),
      direction: sort.direction,
    })),
    { field: requireField(def, KEY_FIELD), direction: query.sort.direction },
  ];
}

function orderBy(keys: OrderKey[]): string {
  return keys
    .map(
      (key) =>
        `${column(key.field.key)} ${key.direction === "asc" ? "ASC" : "DESC"}`,
    )
    .join(", ");
}

// A cursor holds what the server read from a row, which is wider than what a filter may be given: a float8 prints small and large numbers with an exponent, and a text value may be empty.
function isCursorValue(
  def: PostgresGridDef,
  field: BaseFieldDef,
  value: string,
): boolean {
  if (field.type === "text") {
    return value.length <= CURSOR_TEXT_MAX && !value.includes("\u0000");
  }
  if (field.type === "decimal") {
    return CURSOR_NUMBER.test(value);
  }
  return isValidFieldValue(def, field.key, value);
}

function after(key: OrderKey): string {
  return key.direction === "asc" ? ">" : "<";
}

// Columns that all run one way compare as a row, which an index reads as one range; mixed directions have no row form, so they are spelled out behind a bound on the first column, which lets its index still start at the cursor.
function keysetClause(keys: OrderKey[], places: string[]): string {
  const [first] = keys;
  if (keys.every((key) => key.direction === first.direction)) {
    const names = keys.map((key) => column(key.field.key));
    return `(${names.join(", ")}) ${after(first)} (${places.join(", ")})`;
  }
  const spelled = keys.reduceRight((rest, key, at) => {
    const name = column(key.field.key);
    const beyond = `${name} ${after(key)} ${places[at]}`;
    return rest === ""
      ? beyond
      : `(${beyond} OR (${name} = ${places[at]} AND ${rest}))`;
  }, "");
  return `${column(first.field.key)} ${after(first)}= ${places[0]} AND ${spelled}`;
}

export function buildPageSql(
  def: PostgresGridDef,
  query: QueryState,
  limit: number,
  limits: GridLimits = DEFAULT_LIMITS,
): SqlQuery {
  const filtered = filter(def, query);
  const { params } = filtered;
  const or = isCombineOr(query);
  const select = selectList(def);
  // An OR across fields has no index that also gives the order, so its rows are read first, behind OFFSET 0, and sorted after: an ordered walk of the sort index would not stop when few rows match.
  const table = or
    ? `(SELECT ${def.fields.map((field) => column(field.key)).join(", ")} FROM ${from(def)}${whereClause(filtered.clauses)} OFFSET 0) ${TABLE_ALIAS}`
    : from(def);
  const clauses = or ? [] : filtered.clauses;
  if (query.search !== null) {
    return {
      text: `SELECT ${select} FROM ${table}${whereClause(clauses)} LIMIT ${limits.searchLimit + 1}`,
      values: params.values,
    };
  }
  const keys = listOrderKeys(def, query);
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    const values = cursor ? [...cursor.sortValues, cursor.id] : [];
    const usable =
      values.length === keys.length &&
      keys.every((key, at) => isCursorValue(def, key.field, values[at]));
    if (!usable) {
      throw new QueryRejected("invalid_cursor");
    }
    clauses.push(
      keysetClause(
        keys,
        keys.map((key, at) => params.add(values[at], key.field)),
      ),
    );
  }
  return {
    text: `SELECT ${select} FROM ${table}${whereClause(clauses)} ORDER BY ${orderBy(keys)} LIMIT ${clampLimit(limit, limits) + 1}`,
    values: params.values,
  };
}

export function buildRowSql(def: PostgresGridDef, id: string): SqlQuery {
  const keyField = requireField(def, KEY_FIELD);
  const params = new Params();
  return {
    text: `SELECT ${selectList(def)} FROM ${from(def)} WHERE ${column(keyField.key)} = ${params.add(id, keyField)}`,
    values: params.values,
  };
}

export function buildCappedCountSql(
  def: PostgresGridDef,
  query: QueryState,
  cap: number = DEFAULT_LIMITS.countCap,
): SqlQuery {
  const { params, clauses } = filter(def, query);
  return {
    text: `SELECT count(*)::int AS count FROM (SELECT 1 FROM ${from(def)}${whereClause(clauses)} LIMIT ${cap + 1}) capped`,
    values: params.values,
  };
}

export function buildExactCountSql(
  def: PostgresGridDef,
  query: QueryState,
): SqlQuery {
  const { params, clauses } = filter(def, query);
  return {
    text: `SELECT count(*)::float8 AS count FROM ${from(def)}${whereClause(clauses)}`,
    values: params.values,
  };
}

// Only one plain value per field is read in sort order from its index. Several values, not empty, an OR or a filter with an index of its own are capped unordered, like the count: an ordered walk would not stop when few rows match.
export function isTotalOrdered(
  def: PostgresGridDef,
  query: QueryState,
): boolean {
  return (
    !isCombineOr(query) &&
    !isQueryBudgeted(def, query) &&
    query.filters.every(
      (item) =>
        item.op !== "not_blank" &&
        (item.op !== "any_of" || item.values.length === 1),
    )
  );
}

export function buildCappedTotalSql(
  def: PostgresGridDef,
  query: QueryState,
  cap: number = DEFAULT_LIMITS.countCap,
): SqlQuery {
  const totals = def.totals ?? [];
  if (totals.length === 0) {
    throw new Error("the grid declares no totals");
  }
  const { params, clauses } = filter(def, query);
  const amounts = totals.map((key) => column(requireField(def, key).key));
  const sums = totals.map(
    (key) =>
      `coalesce(sum(capped.${identifier(key)}), 0)::float8 AS ${sumColumn(key)}`,
  );
  const core = planQuery(def, query)?.core ?? query;
  const order = isTotalOrdered(def, query)
    ? ` ORDER BY ${[...listSorts(core).map((sort) => sort.field), KEY_FIELD].map(column).join(", ")}`
    : "";
  return {
    text: `SELECT count(*)::int AS count, ${sums.join(", ")} FROM (SELECT ${amounts.join(", ")} FROM ${from(def)}${whereClause(clauses)}${order} LIMIT ${cap + 1}) capped`,
    values: params.values,
  };
}

export function buildGroupSql(
  def: PostgresGridDef,
  query: QueryState,
  limit: number = GROUP_LIMIT,
): SqlQuery {
  assertDeclared(def, query);
  if (query.group === null) {
    throw new QueryRejected("invalid_value", "invalid_value", {
      field: "group",
    });
  }
  const field = requireField(def, query.group);
  const { params, clauses } = filter(def, {
    ...query,
    group: null,
    cursor: null,
  });
  const name = column(field.key);
  const label = field.lookup
    ? `, min(${column(requireField(def, field.lookup.labelField).key)})::text AS label`
    : "";
  const sums = (def.totals ?? [])
    .map(
      (key) =>
        `, coalesce(sum(${column(requireField(def, key).key)}), 0)::float8 AS ${sumColumn(key)}`,
    )
    .join("");
  return {
    text: `SELECT ${name}::text AS value${label}, count(*)::float8 AS count${sums} FROM ${from(def)}${whereClause(clauses)} GROUP BY ${name} ORDER BY count(*) DESC, ${name} LIMIT ${limit + 1}`,
    values: params.values,
  };
}

export function buildFacetSql(def: PostgresGridDef): SqlQuery | null {
  if (!def.facet) {
    return null;
  }
  const sums = (def.totals ?? [])
    .map(sumColumn)
    .map((name) => `, ${name}::float8 AS ${name}`);
  return {
    text: `SELECT ${identifier(def.facet.field)} AS value, row_count::float8 AS count${sums.join("")} FROM ${identifier(def.facet.counterTable)}`,
    values: [],
  };
}

export function toPageResult(
  def: PostgresGridDef,
  query: QueryState,
  rows: GridRow[],
  limit: number,
  limits: GridLimits = DEFAULT_LIMITS,
): PageResult {
  if (query.search !== null) {
    const hasNext = rows.length > limits.searchLimit;
    return {
      rows: hasNext ? rows.slice(0, limits.searchLimit) : rows,
      nextCursor: null,
      hasNext,
    };
  }
  const size = clampLimit(limit, limits);
  const hasNext = rows.length > size;
  const page = hasNext ? rows.slice(0, size) : rows;
  const last = page[page.length - 1];
  if (!hasNext || !last) {
    return { rows: page, nextCursor: null, hasNext: false };
  }
  const sortValues = listSorts(query).map((sort) => {
    const value = last[sort.field];
    if (value === null || value === undefined) {
      throw new Error(`sort column ${sort.field} is missing from the row`);
    }
    return String(value);
  });
  return {
    rows: page,
    nextCursor: encodeCursor({ sortValues, id: last.id }),
    hasNext: true,
  };
}
