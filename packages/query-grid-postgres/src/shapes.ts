import {
  getField,
  isQuickShape,
  KEY_FIELD,
  listOrderedShapes,
  shapeId,
  type FieldDef,
  type OrderedShape,
  type QueryShape,
} from "@kikstart/query-grid";

import type { ServerGridDef } from "./storage.ts";

const QUICK_TYPES: FieldDef["type"][] = [
  "text",
  "enum",
  "integer",
  "money",
  "id",
];

export function describeShape(shape: QueryShape): string {
  if (isQuickShape(shape)) {
    return `quick filter over ${shape.quick.join(", ")}`;
  }
  const filters = shape.equals.length
    ? shape.equals.map((key) => `${key} =`).join(", ")
    : "no filter";
  const range = shape.range ? ` (range on ${shape.sort})` : "";
  return `${filters}, sort ${shape.sort}${range}`;
}

function validateQuickShape(def: ServerGridDef, columns: string[]): string[] {
  const problems: string[] = [];
  if (columns.length === 0) {
    problems.push("the quick filter shape lists no columns");
  }
  for (const key of columns) {
    const field = getField(def, key);
    if (!field) {
      problems.push(`quick filter: unknown field ${key}`);
      continue;
    }
    if (!QUICK_TYPES.includes(field.type)) {
      problems.push(
        `quick filter: ${key} is a ${field.type}, which has no immutable text form to index`,
      );
    }
  }
  return problems;
}

function validateOrderedShape(
  def: ServerGridDef,
  shape: OrderedShape,
): string[] {
  const id = shapeId(shape);
  const sort = getField(def, shape.sort);
  if (!sort) {
    return [`shape ${id}: unknown sort field ${shape.sort}`];
  }
  const problems: string[] = [];
  if (sort.nullable) {
    problems.push(`shape ${id}: a nullable field cannot be a keyset sort`);
  }
  if (shape.range && !sort.operators.includes("range")) {
    problems.push(`shape ${id}: ${shape.sort} does not offer range`);
  }
  if (shape.equals.includes(shape.sort)) {
    problems.push(
      `shape ${id}: ${shape.sort} is both an equality and the sort`,
    );
  }
  for (const key of shape.equals) {
    if (!getField(def, key)?.operators.includes("eq")) {
      problems.push(`shape ${id}: ${key} does not offer eq`);
    }
  }
  return problems;
}

function validateTotals(def: ServerGridDef): string[] {
  const problems: string[] = [];
  if (def.facet && !getField(def, def.facet.field)?.options) {
    problems.push(`facet: ${def.facet.field} is not a field with options`);
  }
  if (def.total) {
    const field = getField(def, def.total.field);
    const summable = field?.type === "money" || field?.type === "integer";
    if (!summable || field?.nullable) {
      problems.push(
        `total: ${def.total.field} is not a non-null money or integer field`,
      );
    }
  }
  return problems;
}

export function validateGridDef(def: ServerGridDef): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  if (!getField(def, KEY_FIELD)) {
    problems.push(`the grid has no "${KEY_FIELD}" field`);
  }
  if (def.shapes.filter(isQuickShape).length > 1) {
    problems.push("a grid declares at most one quick filter shape");
  }
  for (const shape of def.shapes) {
    const id = shapeId(shape);
    if (seen.has(id)) {
      problems.push(`shape ${id} is declared twice`);
    }
    seen.add(id);
    problems.push(
      ...(isQuickShape(shape)
        ? validateQuickShape(def, shape.quick)
        : validateOrderedShape(def, shape)),
    );
  }
  const base = listOrderedShapes(def.shapes).some(
    (shape) =>
      shape.equals.length === 0 && shape.sort === def.defaultSort.field,
  );
  if (!base) {
    problems.push("the default sort with no filter is not a declared shape");
  }
  problems.push(...validateTotals(def));
  return problems;
}
