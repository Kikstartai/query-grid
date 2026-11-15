import {
  getField,
  isCurrencyCode,
  isRangeType,
  KEY_FIELD,
  indexId,
  type BaseFieldDef,
  type IndexDef,
} from "@kikstart/query-grid";

import type { PostgresGridDef } from "./storage.ts";

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
  return `${filters}, sort ${index.sort}${range}`;
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

function validateOrderedIndex(def: PostgresGridDef, index: IndexDef): string[] {
  if (!Array.isArray(index.equals)) {
    return [
      "an index needs `equals` and `sort`; the search columns are `search` on the def",
    ];
  }
  const id = indexId(index);
  const sort = getField(def, index.sort);
  if (!sort) {
    return [`index ${id}: unknown sort field ${index.sort}`];
  }
  const problems: string[] = [];
  if (sort.nullable) {
    problems.push(`index ${id}: a nullable field cannot be a keyset sort`);
  }
  if (index.range && !isRangeType(sort.type)) {
    problems.push(
      `index ${id}: ${index.sort} is a ${sort.type}, which has no range filter`,
    );
  }
  if (index.equals.includes(index.sort)) {
    problems.push(
      `index ${id}: ${index.sort} is both an equality and the sort`,
    );
  }
  for (const key of index.equals) {
    if (!getField(def, key)) {
      problems.push(`index ${id}: unknown equality field ${key}`);
    }
  }
  return problems;
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
  const seen = new Set<string>();
  if (!getField(def, KEY_FIELD)) {
    problems.push(`the grid has no "${KEY_FIELD}" field`);
  }
  if (def.search) {
    problems.push(...validateSearch(def, def.search));
  }
  for (const index of def.indexes) {
    if (!Array.isArray(index.equals)) {
      problems.push(...validateOrderedIndex(def, index));
      continue;
    }
    const id = indexId(index);
    if (seen.has(id)) {
      problems.push(`index ${id} is declared twice`);
    }
    seen.add(id);
    problems.push(...validateOrderedIndex(def, index));
  }
  const base = def.indexes.some(
    (index) =>
      index.equals.length === 0 && index.sort === def.defaultSort.field,
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
