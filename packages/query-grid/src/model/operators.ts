import { isDateType, isNumberType, type BaseFieldDef } from "./grid-def.ts";

export const FIELD_KINDS = [
  "text",
  "number",
  "date",
  "choice",
  "array",
] as const;

export type FieldKind = (typeof FIELD_KINDS)[number];

export const OPERATOR_SHAPES = [
  "one",
  "pair",
  "list",
  "preset",
  "none",
] as const;

export type OperatorShape = (typeof OPERATOR_SHAPES)[number];

export type IndexKind = "filter" | "sort" | "text" | "array";

export interface OperatorDef {
  shape: OperatorShape;
  kinds: readonly FieldKind[];
  index: readonly IndexKind[] | null;
}

const COMPARED = ["number", "date"] as const;
const SETS = ["choice", "array"] as const;
const TEXT_INDEX = ["text"] as const;
const SORT_INDEX = ["sort"] as const;

export const OPERATORS = {
  equals: {
    shape: "one",
    kinds: ["text", ...COMPARED],
    index: ["filter", "sort"],
  },
  not_equals: { shape: "one", kinds: ["text", ...COMPARED], index: null },
  contains: { shape: "one", kinds: ["text"], index: TEXT_INDEX },
  not_contains: { shape: "one", kinds: ["text"], index: null },
  starts_with: { shape: "one", kinds: ["text"], index: TEXT_INDEX },
  ends_with: { shape: "one", kinds: ["text"], index: TEXT_INDEX },
  greater_than: { shape: "one", kinds: COMPARED, index: SORT_INDEX },
  greater_or_equal: { shape: "one", kinds: COMPARED, index: SORT_INDEX },
  less_than: { shape: "one", kinds: COMPARED, index: SORT_INDEX },
  less_or_equal: { shape: "one", kinds: COMPARED, index: SORT_INDEX },
  between: { shape: "pair", kinds: COMPARED, index: SORT_INDEX },
  not_between: { shape: "pair", kinds: COMPARED, index: null },
  in_period: { shape: "preset", kinds: ["date"], index: SORT_INDEX },
  any_of: { shape: "list", kinds: SETS, index: ["filter", "array"] },
  none_of: { shape: "list", kinds: SETS, index: null },
  all_of: { shape: "list", kinds: ["array"], index: ["array"] },
  blank: { shape: "none", kinds: FIELD_KINDS, index: ["filter"] },
  not_blank: {
    shape: "none",
    kinds: ["text", ...COMPARED, "choice"],
    index: ["filter"],
  },
} as const satisfies Record<string, OperatorDef>;

export type FilterOp = keyof typeof OPERATORS;

export type OpOfShape<S extends OperatorShape> = {
  [K in FilterOp]: (typeof OPERATORS)[K]["shape"] extends S ? K : never;
}[FilterOp];

export const FILTER_OPS = Object.keys(OPERATORS) as FilterOp[];

export const TEXT_MATCH_OPS: FilterOp[] = [
  "contains",
  "starts_with",
  "ends_with",
];

export function isFilterOp(value: string): value is FilterOp {
  return Object.hasOwn(OPERATORS, value);
}

export function getOperatorShape(op: FilterOp): OperatorShape {
  return OPERATORS[op].shape;
}

export function listIndexKinds(op: FilterOp): readonly IndexKind[] {
  return OPERATORS[op].index ?? [];
}

export function resolveFieldKind(field: BaseFieldDef): FieldKind {
  if (field.type === "array") {
    return "array";
  }
  const chosen =
    field.options !== undefined ||
    field.lookup !== undefined ||
    field.type === "enum" ||
    field.type === "boolean" ||
    field.type === "id";
  if (chosen) {
    return "choice";
  }
  if (isDateType(field.type)) {
    return "date";
  }
  return isNumberType(field.type) ? "number" : "text";
}

function takesOp(field: BaseFieldDef, kind: FieldKind, op: FilterOp): boolean {
  const kinds: readonly FieldKind[] = OPERATORS[op].kinds;
  if (!kinds.includes(kind)) {
    return false;
  }
  return getOperatorShape(op) !== "none" || field.nullable === true;
}

export function listFieldOps(field: BaseFieldDef): FilterOp[] {
  const kind = resolveFieldKind(field);
  return FILTER_OPS.filter((op) => takesOp(field, kind, op));
}

export function isFieldOp(field: BaseFieldDef, op: FilterOp): boolean {
  return takesOp(field, resolveFieldKind(field), op);
}

export function listFixedValues(field: BaseFieldDef): string[] | null {
  if (field.options) {
    return field.options.map((option) => option.value);
  }
  return field.type === "boolean" ? ["true", "false"] : null;
}

// Only the browser knows the viewer's calendar, and an exclusion over fixed values is answered as the values it keeps, so both are rewritten before a server sees them.
export function isLiteralOp(field: BaseFieldDef, op: FilterOp): boolean {
  return (
    (op === "in_period" && isDateType(field.type)) ||
    (op === "none_of" &&
      field.type !== "array" &&
      listFixedValues(field) !== null)
  );
}
