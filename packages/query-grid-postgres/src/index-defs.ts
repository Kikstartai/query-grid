import {
  getField,
  indexId,
  isCurrencyCode,
  KEY_FIELD,
  listIndexProblems,
  type BaseFieldDef,
  type IndexDef,
  type IndexProblem,
  type IndexRuleCode,
  type ProblemParams,
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

export function describeIndex(index: IndexDef): string {
  const filters = index.equals.length
    ? index.equals.map((key) => `${key} =`).join(", ")
    : "no filter";
  const range = index.range ? ` (range on ${index.sort})` : "";
  const then = index.then?.length ? `, then ${index.then.join(", ")}` : "";
  const blank = index.blank?.length
    ? `, where ${index.blank.map((key) => `${key} is blank`).join(" and ")}`
    : "";
  return `${filters}, sort ${index.sort}${then}${range}${blank}`;
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
  then: "sort field",
  equals: "equality field",
  blank: "blank field",
};

const INDEX_MESSAGES: Record<IndexRuleCode, IndexMessage> = {
  index_unknown_field: ({ field }, role) =>
    `unknown ${UNKNOWN_ROLES[role] ?? "field"} ${field}`,
  index_duplicate: ({ value }, role) =>
    role === "then"
      ? `${value} is sorted on twice`
      : `${value} is declared twice`,
  index_nullable_sort: () => "a nullable field cannot be a keyset sort",
  index_no_range: ({ field, type }) =>
    `${field} is a ${type}, which has no range filter`,
  index_sort_is_equality: ({ field }) =>
    `${field} is both an equality and the sort`,
  index_array_sort: ({ field }) => `${field} is an array, which has no order`,
  index_array_equality: ({ field }) =>
    `${field} is an array; its index is declared in arrayIndexes`,
  index_then_repeats: ({ field }) =>
    `${field} is already an equality, the sort or the key`,
  index_order_too_long: ({ max }) => `an order has at most ${max} columns`,
  index_never_blank: ({ field }) => `${field} is never blank`,
  index_blank_is_filtered: ({ field }) =>
    `${field} is blank in every row of the index, so it cannot also be an equality or the sort`,
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

function validateIndexes(def: PostgresGridDef): string[] {
  const indexes = def.indexes.filter((index) => Array.isArray(index.equals));
  const shapes = def.indexes.length - indexes.length;
  return [
    ...Array.from(
      { length: shapes },
      () =>
        "an index needs `equals` and `sort`; the search columns are `search` on the def",
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
  const base = def.indexes.some(
    (index) =>
      Array.isArray(index.equals) &&
      index.equals.length === 0 &&
      !index.blank?.length &&
      !index.then?.length &&
      index.sort === def.defaultSort.field,
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
