import {
  getField,
  indexId,
  isCurrencyCode,
  KEY_FIELD,
  listIndexProblems,
  listSortIndexes,
  type BaseFieldDef,
  type IndexDef,
  type IndexProblem,
  type IndexRuleCode,
  type ProblemParams,
  type SortIndexDef,
} from "@kikstart/query-grid";

import type { PostgresGridDef } from "./storage.ts";

type IndexMessage = (params: ProblemParams, role: string) => string;

const SEARCH_TYPES: BaseFieldDef["type"][] = [
  "text",
  "enum",
  "integer",
  "money",
  "id",
];

export function describeSearch(columns: string[]): string {
  return `search over ${columns.join(", ")}`;
}

export function describeIndex(index: SortIndexDef): string {
  const filters = index.filter.length
    ? index.filter.map((key) => `${key} =`).join(", ")
    : "no filter";
  const [first, ...then] = index.sort;
  const order = then.length ? `, then ${then.join(", ")}` : "";
  return `${filters}, sort ${first ?? ""}${order}`;
}

export function describeTextIndex(column: string): string {
  return `text match on ${column}`;
}

export function describeArrayIndex(column: string): string {
  return `overlap on ${column}`;
}

function validateSearch(def: PostgresGridDef, columns: string[]): string[] {
  const problems: string[] = [];
  if (columns.length === 0) {
    problems.push("the search lists no columns");
  }
  for (const key of columns) {
    const field = getField(def, key);
    if (!field) {
      problems.push(`search: unknown field ${key}`);
      continue;
    }
    if (!SEARCH_TYPES.includes(field.type)) {
      problems.push(
        `search: ${key} is a ${field.type}, which has no immutable text form to index`,
      );
    }
  }
  return problems;
}

const UNKNOWN_ROLES: Record<string, string> = {
  sort: "sort field",
  filter: "filter field",
  text: "text field",
  array: "array field",
};

const INDEX_MESSAGES: Record<IndexRuleCode, IndexMessage> = {
  index_unknown_field: ({ field }, role) =>
    `unknown ${UNKNOWN_ROLES[role] ?? "field"} ${field}`,
  index_duplicate: ({ value }, role) =>
    role === "sort" ? `${value} is sorted on twice` : `${value} is declared twice`,
  index_nullable_sort: () => "a nullable field cannot be a keyset sort",
  index_no_sort: () => "an index needs at least one sort column",
  index_sort_is_filter: ({ field }) => `${field} is both a filter and a sort column`,
  index_array_sort: ({ field }) => `${field} is an array, which has no order`,
  index_array_filter: ({ field }) =>
    `${field} is an array; its index is { array: "${field}" }`,
  index_sort_repeats: ({ field }) => `${field} is the key, which ends every order`,
  index_order_too_long: ({ max }) => `an order has at most ${max} columns`,
  index_not_text: ({ field }) => `${field} is not a text field without options`,
  index_not_array: ({ field }) => `${field} is not an array field`,
};

function describeIndexProblem(
  indexes: IndexDef[],
  { code, params }: IndexProblem,
): string {
  const [list, at, role = ""] = String(params.path).split(".");
  if (list !== "indexes") {
    return `${list}: ${INDEX_MESSAGES[code](params, role)}`;
  }
  const id = indexId(indexes[Number(at)]);
  if (role === "") {
    return `index ${id} is declared twice`;
  }
  return `index ${id}: ${INDEX_MESSAGES[code](params, role)}`;
}

function isWellFormed(index: IndexDef): boolean {
  if ("text" in index) {
    return typeof index.text === "string";
  }
  if ("array" in index) {
    return typeof index.array === "string";
  }
  return Array.isArray(index.filter) && Array.isArray(index.sort);
}

function validateIndexes(def: PostgresGridDef): string[] {
  const indexes = def.indexes.filter(isWellFormed);
  const shapes = def.indexes.length - indexes.length;
  return [
    ...Array.from(
      { length: shapes },
      () =>
        "an index is { filter, sort }, { text } or { array }; the search columns are `search` on the def",
    ),
    ...listIndexProblems({ ...def, indexes }).map((problem) =>
      describeIndexProblem(indexes, problem),
    ),
  ];
}

function validateTotals(def: PostgresGridDef): string[] {
  const problems: string[] = [];
  if (def.facet && !getField(def, def.facet.field)?.options) {
    problems.push(`facet: ${def.facet.field} is not a field with options`);
  }
  const totals = def.totals ?? [];
  for (const key of totals) {
    const field = getField(def, key);
    const summable = field?.type === "money" || field?.type === "integer";
    if (!summable || field?.nullable) {
      problems.push(`total: ${key} is not a non-null money or integer field`);
    }
  }
  const repeated = totals.filter((key, at) => totals.indexOf(key) !== at);
  for (const key of new Set(repeated)) {
    problems.push(`total: ${key} is declared twice`);
  }
  return problems;
}

export function validateGridDef(def: PostgresGridDef): string[] {
  const problems: string[] = [];
  if (!getField(def, KEY_FIELD)) {
    problems.push(`the grid has no "${KEY_FIELD}" field`);
  }
  if (def.search) {
    problems.push(...validateSearch(def, def.search));
  }
  problems.push(...validateIndexes(def));
  const base = listSortIndexes(def.indexes).some(
    (index) =>
      Array.isArray(index.filter) &&
      index.filter.length === 0 &&
      Array.isArray(index.sort) &&
      index.sort.length === 1 &&
      index.sort[0] === def.defaultSort.field,
  );
  if (!base) {
    problems.push("the default sort with no filter is not a declared index");
  }
  problems.push(...validateTotals(def));
  for (const field of def.fields) {
    if (field.currency !== undefined && !isCurrencyCode(field.currency)) {
      problems.push(`${field.key}: ${field.currency} is not a currency code`);
    }
  }
  return problems;
}
