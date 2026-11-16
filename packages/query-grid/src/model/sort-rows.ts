import {
  getField,
  isDateType,
  isNumberType,
  type BaseFieldDef,
  type BaseGridDef,
  type GridRow,
  type GridValue,
  type SortState,
} from "./field-types.ts";

export function toComparable(
  field: BaseFieldDef,
  value: GridValue,
): string | number | null {
  if (value === null || value === "") {
    return null;
  }
  if (Array.isArray(value)) {
    return value.join(" ").toLowerCase();
  }
  if (isNumberType(field.type)) {
    return Number(value);
  }
  if (isDateType(field.type)) {
    return Date.parse(String(value));
  }
  return String(value).toLowerCase();
}

function compareValues(
  a: string | number | null,
  b: string | number | null,
): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a < b ? -1 : 1;
}

export function sortRows(
  def: BaseGridDef,
  rows: GridRow[],
  sort: SortState,
): GridRow[] {
  const field = getField(def, sort.field);
  if (!field) {
    return rows;
  }
  const sign = sort.direction === "asc" ? 1 : -1;
  return rows
    .map((row) => ({ row, value: toComparable(field, row[field.key] ?? null) }))
    .sort(
      (a, b) =>
        (compareValues(a.value, b.value) || compareValues(a.row.id, b.row.id)) *
        sign,
    )
    .map((keyed) => keyed.row);
}
