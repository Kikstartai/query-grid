import {
  getField,
  isQuickShape,
  KEY_FIELD,
  listQuickFields,
  type FieldDef,
  type GridDef,
  type OrderedShape,
  type QueryMode,
  type QueryShape,
  type QueryState,
} from "./field-types.ts";

const QUICK_TYPES: FieldDef["type"][] = [
  "text",
  "enum",
  "integer",
  "money",
  "id",
];

export function shapeId(shape: QueryShape): string {
  if (isQuickShape(shape)) {
    return `quick:${shape.quick.join("+")}`;
  }
  return `${[...shape.equals].sort().join("+")}|${shape.sort}`;
}

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

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

export function listOrderedShapes(def: GridDef): OrderedShape[] {
  return def.shapes.filter(
    (shape): shape is OrderedShape => !isQuickShape(shape),
  );
}

export function listSortFields(def: GridDef, mode: QueryMode): string[] {
  if (mode === "memory") {
    return def.fields.map((field) => field.key);
  }
  return [...new Set(listOrderedShapes(def).map((shape) => shape.sort))];
}

export function matchShape(def: GridDef, query: QueryState): QueryShape | null {
  const equals = Object.keys(query.equals);
  if (query.quick !== null) {
    const answerable =
      equals.length === 0 &&
      query.range === null &&
      listSortFields(def, "indexed").includes(query.sort.field);
    return answerable ? (def.shapes.find(isQuickShape) ?? null) : null;
  }
  const ordered = listOrderedShapes(def).find(
    (shape) => shape.sort === query.sort.field && sameSet(shape.equals, equals),
  );
  if (!ordered) {
    return null;
  }
  if (query.range && (!ordered.range || query.range.field !== ordered.sort)) {
    return null;
  }
  return ordered;
}

function isAnswerableInMemory(def: GridDef, query: QueryState): boolean {
  const equalsOffered = Object.keys(query.equals).every((key) =>
    getField(def, key)?.operators.includes("eq"),
  );
  const rangeOffered =
    query.range === null ||
    getField(def, query.range.field)?.operators.includes("range") === true;
  const quickOffered = query.quick === null || listQuickFields(def).length > 0;
  return (
    equalsOffered &&
    rangeOffered &&
    quickOffered &&
    getField(def, query.sort.field) !== null
  );
}

export function isAnswerable(
  def: GridDef,
  query: QueryState,
  mode: QueryMode,
): boolean {
  if (mode === "memory") {
    return isAnswerableInMemory(def, query);
  }
  return matchShape(def, query) !== null;
}

export function isFacetOnlyQuery(def: GridDef, query: QueryState): boolean {
  const facetField = def.facet?.field;
  return (
    facetField !== undefined &&
    query.range === null &&
    query.quick === null &&
    Object.keys(query.equals).every((key) => key === facetField)
  );
}

export function isFacetCountShown(
  def: GridDef,
  query: QueryState,
  mode: QueryMode,
): boolean {
  return mode === "memory" || isFacetOnlyQuery(def, query);
}

function validateQuickShape(def: GridDef, columns: string[]): string[] {
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

function validateOrderedShape(def: GridDef, shape: OrderedShape): string[] {
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

function validateTotals(def: GridDef): string[] {
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

export function validateGridDef(def: GridDef): string[] {
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
  const base = listOrderedShapes(def).some(
    (shape) =>
      shape.equals.length === 0 && shape.sort === def.defaultSort.field,
  );
  if (!base) {
    problems.push("the default sort with no filter is not a declared shape");
  }
  problems.push(...validateTotals(def));
  return problems;
}
