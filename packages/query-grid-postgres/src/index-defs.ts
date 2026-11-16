import {
  getField,
  isCurrencyCode,
  isOverlapField,
  isRangeType,
  isTextField,
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
  const empty = index.empty?.length
    ? `, where ${index.empty.map((key) => `${key} is empty`).join(" and ")}`
    : "";
  return `${filters}, sort ${index.sort}${range}${empty}`;
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
  if (isOverlapField(sort)) {
    problems.push(`index ${id}: ${index.sort} is an array, which has no order`);
  }
  for (const key of index.equals) {
    const field = getField(def, key);
    if (!field) {
      problems.push(`index ${id}: unknown equality field ${key}`);
      continue;
    }
    if (isOverlapField(field)) {
      problems.push(
        `index ${id}: ${key} is an array; its index is declared in arrayIndexes`,
      );
    }
  }
  for (const key of index.empty ?? []) {
    const field = getField(def, key);
    if (!field) {
      problems.push(`index ${id}: unknown empty field ${key}`);
      continue;
    }
    if (!field.nullable) {
      problems.push(`index ${id}: ${key} is never empty`);
    }
    if (index.equals.includes(key) || key === index.sort) {
      problems.push(
        `index ${id}: ${key} is empty in every row of the index, so it cannot also be an equality or the sort`,
      );
    }
  }
  return problems;
}

function validateFieldIndexes(def: PostgresGridDef): string[] {
  const problems: string[] = [];
  const check = (
    name: string,
    keys: string[],
    fits: (field: BaseFieldDef) => boolean,
    needs: string,
  ) => {
    for (const key of keys) {
      const field = getField(def, key);
      if (!field) {
        problems.push(`${name}: unknown field ${key}`);
        continue;
      }
      if (!fits(field)) {
        problems.push(`${name}: ${key} is not ${needs}`);
      }
    }
    for (const key of new Set(
      keys.filter((key, at) => keys.indexOf(key) !== at),
    )) {
      problems.push(`${name}: ${key} is declared twice`);
    }
  };
  check(
    "textIndexes",
    def.textIndexes ?? [],
    isTextField,
    "a text field without options",
  );
  check(
    "arrayIndexes",
    def.arrayIndexes ?? [],
    isOverlapField,
    "an array field",
  );
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
  problems.push(...validateFieldIndexes(def));
  for (const field of def.fields) {
    if (field.currency !== undefined && !isCurrencyCode(field.currency)) {
      problems.push(`${field.key}: ${field.currency} is not a currency code`);
    }
  }
  return problems;
}
