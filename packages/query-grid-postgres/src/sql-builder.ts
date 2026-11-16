import {
  DEFAULT_LIMITS,
  formatProblem,
  getField,
  GROUP_LIMIT,
  getReservedValue,
  isMatchAny,
  isNumberType,
  isQueryBudgeted,
  isQueryRunnable,
  isValidFieldValue,
  KEY_FIELD,
  listSearchFields,
  listSorts,
  PAGE_LIMIT_MAX,
  planQuery,
  validateQueryValues,
  type BaseFieldDef,
  type FieldType,
  type GridLimits,
  type GridRow,
  type PageResult,
  type ProblemParams,
  type QueryState,
  type RangeState,
  type SortDirection,
  type TextOp,
  type TextState,
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

interface Filter {
  params: Params;
  clauses: string[];
}

// An excluded range is written as the two sides outside it, never as NOT (…): each side stays a plain comparison, and an empty cell is outside every range.
function rangeClauses(
  field: BaseFieldDef,
  range: RangeState,
  params: Params,
): string[] {
  const name = column(field.key);
  const outside = range.exclude === true;
  const parts: string[] = [];
  if (range.min !== null) {
    const inside = range.minExclusive ? ">" : ">=";
    const operator = outside ? (range.minExclusive ? "<=" : "<") : inside;
    parts.push(`${name} ${operator} ${params.add(range.min, field)}`);
  }
  if (range.max !== null) {
    const inside = range.maxExclusive ? "<" : "<=";
    const operator = outside ? (range.maxExclusive ? ">=" : ">") : inside;
    parts.push(`${name} ${operator} ${params.add(range.max, field)}`);
  }
  if (!outside) {
    return parts;
  }
  const sides = field.nullable ? [...parts, `${name} IS NULL`] : parts;
  return [sides.length > 1 ? `(${sides.join(" OR ")})` : sides[0]];
}

type LikeOp = Exclude<TextOp, "not_equals">;

const LIKE_PATTERNS: Record<LikeOp, (value: string) => string> = {
  contains: (value) => `%${value}%`,
  not_contains: (value) => `%${value}%`,
  starts_with: (value) => `${value}%`,
  ends_with: (value) => `%${value}`,
};

function textClause(
  field: BaseFieldDef,
  text: TextState,
  params: Params,
): string {
  const name = column(field.key);
  const value = text.value.trim();
  if (text.op === "not_equals") {
    return `${name} IS DISTINCT FROM ${params.addText(value)}`;
  }
  const pattern = params.addText(LIKE_PATTERNS[text.op](escapeLike(value)));
  if (text.op !== "not_contains") {
    return `${name} ILIKE ${pattern}`;
  }
  return field.nullable
    ? `(${name} NOT ILIKE ${pattern} OR ${name} IS NULL)`
    : `${name} NOT ILIKE ${pattern}`;
}

function anyOf(terms: string[][]): string[] {
  const alternatives = terms
    .filter((parts) => parts.length > 0)
    .map((parts) => (parts.length > 1 ? `(${parts.join(" AND ")})` : parts[0]));
  return alternatives.length > 0 ? [`(${alternatives.join(" OR ")})`] : [];
}

function filter(def: PostgresGridDef, query: QueryState): Filter {
  assertDeclared(def, query);
  const params = new Params();
  const terms: string[][] = [];
  for (const [key, values] of Object.entries(query.equals)) {
    terms.push([equalsClause(requireField(def, key), values, params)]);
  }
  for (const range of query.ranges) {
    terms.push(rangeClauses(requireField(def, range.field), range, params));
  }
  for (const text of query.texts) {
    terms.push([textClause(requireField(def, text.field), text, params)]);
  }
  for (const [key, values] of Object.entries(query.overlaps)) {
    const field = requireField(def, key);
    terms.push([`${column(field.key)} && ${params.addList(values, field)}`]);
  }
  const clauses = isMatchAny(query) ? anyOf(terms) : terms.flat();
  if (query.search !== null) {
    const pattern = `%${escapeLike(query.search.trim())}%`;
    clauses.push(
      `(${searchExpression(def, `${TABLE_ALIAS}.`)}) ILIKE ${params.addText(pattern)}`,
    );
  }
  return { params, clauses };
}

function equalsClause(
  field: BaseFieldDef,
  values: string[],
  params: Params,
): string {
  const name = column(field.key);
  if (values.some((value) => getReservedValue(field, value) === "not_empty")) {
    return `${name} IS NOT NULL`;
  }
  const real = values.filter(
    (value) => getReservedValue(field, value) === null,
  );
  if (real.length === 0) {
    return `${name} IS NULL`;
  }
  const matches =
    real.length === 1
      ? `${name} = ${params.add(real[0], field)}`
      : `${name} = ANY(${params.addList(real, field)})`;
  return real.length === values.length
    ? matches
    : `(${matches} OR ${name} IS NULL)`;
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

function isCursorValue(
  def: PostgresGridDef,
  field: BaseFieldDef,
  value: string,
): boolean {
  return field.type === "text" && !field.options
    ? value.length <= CURSOR_TEXT_MAX
    : isValidFieldValue(def, field.key, value);
}

function after(key: OrderKey): string {
  return key.direction === "asc" ? ">" : "<";
}

// Columns that all run one way compare as a row, which an index reads as one range. Mixed directions have no row form: they are spelled out column by column, and run only over a narrowed set.
function keysetClause(keys: OrderKey[], places: string[]): string {
  const [first] = keys;
  if (keys.every((key) => key.direction === first.direction)) {
    const names = keys.map((key) => column(key.field.key));
    return `(${names.join(", ")}) ${after(first)} (${places.join(", ")})`;
  }
  return keys.reduceRight((rest, key, at) => {
    const name = column(key.field.key);
    const beyond = `${name} ${after(key)} ${places[at]}`;
    return rest === ""
      ? beyond
      : `(${beyond} OR (${name} = ${places[at]} AND ${rest}))`;
  }, "");
}

export function buildPageSql(
  def: PostgresGridDef,
  query: QueryState,
  limit: number,
  limits: GridLimits = DEFAULT_LIMITS,
): SqlQuery {
  const filtered = filter(def, query);
  const { params } = filtered;
  const any = isMatchAny(query);
  const select = selectList(def);
  // An OR across fields has no index that also gives the order, so its rows are read first, behind OFFSET 0, and sorted after: an ordered walk of the sort index would not stop when few rows match.
  const table = any
    ? `(SELECT ${def.fields.map((field) => column(field.key)).join(", ")} FROM ${from(def)}${whereClause(filtered.clauses)} OFFSET 0) ${TABLE_ALIAS}`
    : from(def);
  const clauses = any ? [] : filtered.clauses;
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
    !isMatchAny(query) &&
    !isQueryBudgeted(def, query) &&
    Object.entries(query.equals).every(
      ([key, values]) =>
        values.length === 1 &&
        getReservedValue(requireField(def, key), values[0]) !== "not_empty",
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
  const core = planQuery(def.indexes, query, def)?.core ?? query;
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
