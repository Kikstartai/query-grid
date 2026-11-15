import {
  COUNT_CAP,
  formatProblem,
  getField,
  isValidFieldValue,
  KEY_FIELD,
  isQueryIndexed,
  listQuickFields,
  PAGE_LIMIT_MAX,
  QUICK_LIMIT,
  validateQueryValues,
  type BaseFieldDef,
  type FieldType,
  type GridRow,
  type PageResult,
  type ProblemParams,
  type QueryState,
} from "@kikstart/query-grid";

import { decodeCursor, encodeCursor } from "./cursor.ts";
import type { PostgresGridDef } from "./storage.ts";

export const DEFAULT_PAGE_LIMIT = 200;

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
  money: "bigint",
  datetime: "timestamptz",
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
  if (field.type === "integer" || field.type === "money") {
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

function quickPart(field: BaseFieldDef, prefix: string): string {
  const name = `${prefix}${identifier(field.key)}`;
  const text =
    field.type === "text" || field.type === "enum" ? name : `${name}::text`;
  return field.nullable ? `coalesce(${text}, '')` : text;
}

export function quickExpression(def: PostgresGridDef, prefix = ""): string {
  return listQuickFields(def)
    .map((key) => quickPart(requireField(def, key), prefix))
    .join(" || ' ' || ");
}

export function assertDeclared(def: PostgresGridDef, query: QueryState): void {
  if (!isQueryIndexed(def.indexes, listQuickFields(def), query)) {
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

function filter(def: PostgresGridDef, query: QueryState): Filter {
  assertDeclared(def, query);
  const params = new Params();
  const clauses: string[] = [];
  for (const [key, values] of Object.entries(query.equals)) {
    const field = requireField(def, key);
    clauses.push(
      values.length === 1
        ? `${column(key)} = ${params.add(values[0], field)}`
        : `${column(key)} = ANY(${params.addList(values, field)})`,
    );
  }
  if (query.range) {
    const field = requireField(def, query.range.field);
    if (query.range.min !== null) {
      clauses.push(
        `${column(field.key)} >= ${params.add(query.range.min, field)}`,
      );
    }
    if (query.range.max !== null) {
      clauses.push(
        `${column(field.key)} <= ${params.add(query.range.max, field)}`,
      );
    }
  }
  if (query.quick !== null) {
    const pattern = `%${escapeLike(query.quick.trim())}%`;
    clauses.push(
      `(${quickExpression(def, `${TABLE_ALIAS}.`)}) ILIKE ${params.addText(pattern)}`,
    );
  }
  return { params, clauses };
}

function whereClause(clauses: string[]): string {
  return clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
}

function clampLimit(requested: number): number {
  if (!Number.isFinite(requested) || requested < 1) {
    return DEFAULT_PAGE_LIMIT;
  }
  return Math.min(Math.floor(requested), PAGE_LIMIT_MAX);
}

export function buildPageSql(
  def: PostgresGridDef,
  query: QueryState,
  limit: number,
): SqlQuery {
  const { params, clauses } = filter(def, query);
  const select = selectList(def);
  const table = from(def);
  if (query.quick !== null) {
    return {
      text: `SELECT ${select} FROM ${table}${whereClause(clauses)} LIMIT ${QUICK_LIMIT + 1}`,
      values: params.values,
    };
  }
  const sortField = requireField(def, query.sort.field);
  const keyField = requireField(def, KEY_FIELD);
  const sort = column(sortField.key);
  const key = column(keyField.key);
  const direction = query.sort.direction === "asc" ? "ASC" : "DESC";
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    const usable =
      cursor !== null &&
      isValidFieldValue(def, sortField.key, cursor.sortValue) &&
      isValidFieldValue(def, keyField.key, cursor.id);
    if (!cursor || !usable) {
      throw new QueryRejected("invalid_cursor");
    }
    const comparator = query.sort.direction === "asc" ? ">" : "<";
    clauses.push(
      `(${sort}, ${key}) ${comparator} (${params.add(cursor.sortValue, sortField)}, ${params.add(cursor.id, keyField)})`,
    );
  }
  return {
    text: `SELECT ${select} FROM ${table}${whereClause(clauses)} ORDER BY ${sort} ${direction}, ${key} ${direction} LIMIT ${clampLimit(limit) + 1}`,
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
  cap: number = COUNT_CAP,
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

export function buildCappedTotalSql(
  def: PostgresGridDef,
  query: QueryState,
  cap: number = COUNT_CAP,
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
  const order =
    query.quick === null
      ? ` ORDER BY ${column(requireField(def, query.sort.field).key)}, ${column(KEY_FIELD)}`
      : "";
  return {
    text: `SELECT count(*)::int AS count, ${sums.join(", ")} FROM (SELECT ${amounts.join(", ")} FROM ${from(def)}${whereClause(clauses)}${order} LIMIT ${cap + 1}) capped`,
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
): PageResult {
  if (query.quick !== null) {
    const hasNext = rows.length > QUICK_LIMIT;
    return {
      rows: hasNext ? rows.slice(0, QUICK_LIMIT) : rows,
      nextCursor: null,
      hasNext,
    };
  }
  const size = clampLimit(limit);
  const hasNext = rows.length > size;
  const page = hasNext ? rows.slice(0, size) : rows;
  const last = page[page.length - 1];
  if (!hasNext || !last) {
    return { rows: page, nextCursor: null, hasNext: false };
  }
  const sortValue = last[query.sort.field];
  if (sortValue === null || sortValue === undefined) {
    throw new Error(`sort column ${query.sort.field} is missing from the row`);
  }
  return {
    rows: page,
    nextCursor: encodeCursor({ sortValue: String(sortValue), id: last.id }),
    hasNext: true,
  };
}
