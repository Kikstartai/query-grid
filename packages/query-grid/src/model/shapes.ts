import type { BaseGridDef, Capabilities, QueryState } from "./field-types.ts";

export interface OrderedShape {
  equals: string[];
  sort: string;
  range?: boolean;
  multi?: boolean;
}

export interface QuickShape {
  quick: string[];
}

export type QueryShape = OrderedShape | QuickShape;

export interface ShapedGridDef extends BaseGridDef {
  shapes: QueryShape[];
}

export interface ShapeCapabilityOptions {
  facetField?: string;
}

export function isQuickShape(shape: QueryShape): shape is QuickShape {
  return "quick" in shape;
}

export function listQuickFields(shapes: QueryShape[]): string[] {
  return shapes.find(isQuickShape)?.quick ?? [];
}

export function shapeId(shape: QueryShape): string {
  if (isQuickShape(shape)) {
    return `quick:${shape.quick.join("+")}`;
  }
  return `${[...shape.equals].sort().join("+")}|${shape.sort}`;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

export function listOrderedShapes(shapes: QueryShape[]): OrderedShape[] {
  return shapes.filter((shape): shape is OrderedShape => !isQuickShape(shape));
}

export function listSortFields(shapes: QueryShape[]): string[] {
  return [...new Set(listOrderedShapes(shapes).map((shape) => shape.sort))];
}

export function matchShape(
  shapes: QueryShape[],
  query: QueryState,
): QueryShape | null {
  const equals = Object.keys(query.equals);
  if (query.quick !== null) {
    const answerable =
      equals.length === 0 &&
      query.range === null &&
      listSortFields(shapes).includes(query.sort.field);
    return answerable ? (shapes.find(isQuickShape) ?? null) : null;
  }
  const ordered = listOrderedShapes(shapes).find(
    (shape) => shape.sort === query.sort.field && sameSet(shape.equals, equals),
  );
  if (!ordered) {
    return null;
  }
  if (query.range && (!ordered.range || query.range.field !== ordered.sort)) {
    return null;
  }
  const several = Object.values(query.equals).some(
    (values) => values.length > 1,
  );
  return several && ordered.multi === false ? null : ordered;
}

export function isFacetOnlyQuery(
  facetField: string | undefined,
  query: QueryState,
): boolean {
  return (
    facetField !== undefined &&
    query.range === null &&
    query.quick === null &&
    Object.keys(query.equals).every((key) => key === facetField)
  );
}

export function shapeCapabilities(
  shapes: QueryShape[],
  options: ShapeCapabilityOptions = {},
): Capabilities {
  return {
    mode: "server",
    isAnswerable: (query) => matchShape(shapes, query) !== null,
    sortFields: listSortFields(shapes),
    quickFields: listQuickFields(shapes),
    isFacetCountShown: (query) => isFacetOnlyQuery(options.facetField, query),
  };
}
