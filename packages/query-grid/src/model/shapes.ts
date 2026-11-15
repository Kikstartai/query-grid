import {
  listQuickFields,
  type BaseGridDef,
  type Capabilities,
  type QueryState,
} from "./field-types.ts";

export interface QueryShape {
  equals: string[];
  sort: string;
  range?: boolean;
  multi?: boolean;
}

export interface ShapedGridDef extends BaseGridDef {
  shapes: QueryShape[];
}

export interface ShapeCapabilityOptions {
  facetField?: string;
  quickFields?: string[];
}

export function shapeId(shape: QueryShape): string {
  return `${[...shape.equals].sort().join("+")}|${shape.sort}`;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function listEqualsFields(shapes: QueryShape[]): string[] {
  return [...new Set(shapes.flatMap((shape) => shape.equals))];
}

function listRangeFields(shapes: QueryShape[]): string[] {
  return [
    ...new Set(
      shapes.filter((shape) => shape.range).map((shape) => shape.sort),
    ),
  ];
}

export function listSortFields(shapes: QueryShape[]): string[] {
  return [...new Set(shapes.map((shape) => shape.sort))];
}

export function matchShape(
  shapes: QueryShape[],
  query: QueryState,
): QueryShape | null {
  const equals = Object.keys(query.equals);
  if (query.quick !== null) {
    return null;
  }
  const ordered = shapes.find(
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

export function isQueryDeclared(
  shapes: QueryShape[],
  quickFields: string[],
  query: QueryState,
): boolean {
  if (query.quick === null) {
    return matchShape(shapes, query) !== null;
  }
  return (
    quickFields.length > 0 &&
    Object.keys(query.equals).length === 0 &&
    query.range === null &&
    listSortFields(shapes).includes(query.sort.field)
  );
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
  const quickFields = options.quickFields ?? [];
  return {
    mode: "server",
    isAnswerable: (query) => isQueryDeclared(shapes, quickFields, query),
    equalsFields: listEqualsFields(shapes),
    rangeFields: listRangeFields(shapes),
    sortFields: listSortFields(shapes),
    quickFields,
    isFacetCountShown: (query) => isFacetOnlyQuery(options.facetField, query),
  };
}

export function gridDefCapabilities(def: ShapedGridDef): Capabilities {
  return shapeCapabilities(def.shapes, {
    facetField: def.facet?.field,
    quickFields: listQuickFields(def),
  });
}
