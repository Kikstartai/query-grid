import {
  formatProblem,
  getField,
  isValidFieldValue,
  KEY_FIELD,
  listQuickFields,
  matchShape,
  validateQueryValues,
  type FieldDef,
  type FieldType,
  type GridRow,
  type ProblemParams,
  type QueryState,
} from "@kikstart/query-grid";
import {
  COUNT_CAP,
  PAGE_LIMIT_MAX,
  QUICK_LIMIT,
  type PageResult,
} from "@kikstart/query-grid/http";

import { decodeCursor, encodeCursor } from "./cursor.ts";
import type { ServerGridDef } from "./storage.ts";

export const DEFAULT_PAGE_LIMIT = 200;

export type SqlValue = string | string[];

export interface SqlQuery {
  text: string;
  values: SqlValue[];
}

export type RejectionCode =
  | "undeclared_shape"
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

function column(name: string): string {
  return `${TABLE_ALIAS}.${identifier(name)}`;
}

function from(def: ServerGridDef): string {
  return `${identifier(def.table)} ${TABLE_ALIAS}`;
}

function selectExpression(field: FieldDef): string {
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

function requireField(def: ServerGridDef, key: string): FieldDef {
  const field = getField(def, key);
  if (!field) {
    throw new QueryRejected("undeclared_shape", "unknown_field", {
      field: key,
    });
  }
  return field;
}

function quickPart(field: FieldDef, prefix: string): string {
  const name = `${prefix}${identifier(field.key)}`;
  const text =
    field.type === "text" || field.type === "enum" ? name : `${name}::text`;
  return field.nullable ? `coalesce(${text}, '')` : text;
}

export function quickExpression(def: ServerGridDef, prefix = ""): string {
  return listQuickFields(def.shapes)
    .map((key) => quickPart(requireField(def, key), prefix))
    .join(" || ' ' || ");
}

export function assertDeclared(def: ServerGridDef, query: QueryState): void {
  if (!matchShape(def.shapes, query)) {
    throw new QueryRejected("undeclared_shape");
  }
  const problem = validateQueryValues(def, query);
  if (problem) {
    throw new QueryRejected("invalid_value", problem.code, problem.params);
  }
}

class Params {
  readonly values: SqlValue[] = [];

  addList(values: string[], field: FieldDef): string {
    this.values.push(values);
    return `$${this.values.length}::${SQL_CASTS[field.type]}[]`;
  }

  add(value: string, field: FieldDef): string {
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

function selectList(def: ServerGridDef): string {
  return def.fields.map(selectExpression).join(", ");
}

interface Filter {
  params: Params;
  clauses: string[];
}

function filter(def: ServerGridDef, query: QueryState): Filter {
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
  def: ServerGridDef,
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

export function buildRowSql(def: ServerGridDef, id: string): SqlQuery {
  const keyField = requireField(def, KEY_FIELD);
  const params = new Params();
  return {
    text: `SELECT ${selectList(def)} FROM ${from(def)} WHERE ${column(keyField.key)} = ${params.add(id, keyField)}`,
    values: params.values,
  };
}

export function buildCappedCountSql(
  def: ServerGridDef,
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
  def: ServerGridDef,
  query: QueryState,
): SqlQuery {
  const { params, clauses } = filter(def, query);
  return {
    text: `SELECT count(*)::float8 AS count FROM ${from(def)}${whereClause(clauses)}`,
    values: params.values,
  };
}

export function buildCappedTotalSql(
  def: ServerGridDef,
  query: QueryState,
  cap: number = COUNT_CAP,
): SqlQuery {
  if (!def.total) {
    throw new Error("the grid declares no total");
  }
  const { params, clauses } = filter(def, query);
  const total = column(requireField(def, def.total.field).key);
  const order =
    query.quick === null
      ? ` ORDER BY ${column(requireField(def, query.sort.field).key)}, ${column(KEY_FIELD)}`
      : "";
  return {
    text: `SELECT count(*)::int AS count, coalesce(sum(capped.amount), 0)::float8 AS sum FROM (SELECT ${total} AS amount FROM ${from(def)}${whereClause(clauses)}${order} LIMIT ${cap + 1}) capped`,
    values: params.values,
  };
}

export function buildFacetSql(def: ServerGridDef): SqlQuery | null {
  if (!def.facet) {
    return null;
  }
  const sum = def.total ? ", total_sum::float8 AS sum" : "";
  return {
    text: `SELECT ${identifier(def.facet.field)} AS value, row_count::float8 AS count${sum} FROM ${identifier(def.facet.counterTable)}`,
    values: [],
  };
}

export function toPageResult(
  def: ServerGridDef,
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
