import {
  getField,
  isDateType,
  isNumberType,
  type BaseFieldDef,
  type BaseGridDef,
  type GridRow,
  type GridValue,
  type SortState,
} from "./grid-def.ts";

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

interface SortKey {
  field: BaseFieldDef;
  sign: number;
}

function toSortKey(def: BaseGridDef, sort: SortState): SortKey | null {
  const field = getField(def, sort.field);
  return field ? { field, sign: sort.direction === "asc" ? 1 : -1 } : null;
}

export function sortRows(
  def: BaseGridDef,
  rows: GridRow[],
  sort: SortState,
  thenBy: SortState[] = [],
): GridRow[] {
  const first = toSortKey(def, sort);
  if (!first) {
    return rows;
  }
  const keys = [first, ...thenBy.flatMap((item) => toSortKey(def, item) ?? [])];
  return rows
    .map((row) => ({
      row,
      values: keys.map((key) =>
        toComparable(key.field, row[key.field.key] ?? null),
      ),
    }))
    .sort((a, b) => {
      for (let at = 0; at < keys.length; at++) {
        const order = compareValues(a.values[at], b.values[at]);
        if (order !== 0) {
          return order * keys[at].sign;
        }
      }
      return compareValues(a.row.id, b.row.id) * first.sign;
    })
    .map((keyed) => keyed.row);
}
