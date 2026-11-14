import {
  getField,
  type FieldDef,
  type GridDef,
  type GridRow,
  type SortState,
} from "./field-types.ts";

export function toComparable(
  field: FieldDef,
  value: string | number | null,
): string | number | null {
  if (value === null || value === "") {
    return null;
  }
  if (field.type === "integer" || field.type === "money") {
    return Number(value);
  }
  if (field.type === "datetime") {
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
  def: GridDef,
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
