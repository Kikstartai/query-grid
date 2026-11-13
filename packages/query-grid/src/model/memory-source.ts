import type { DataSource } from "./data-source.ts";
import {
  getField,
  listQuickFields,
  type FieldDef,
  type FieldOption,
  type GridDef,
  type GridRow,
  type QueryState,
  type SortState,
} from "./field-types.ts";
import type { FacetCount } from "./wire-types.ts";

const OPTION_LIMIT = 50;

export interface MemorySourceOptions {
  transitions?: [string, string][];
}

function toComparable(
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

function matchesRange(
  def: GridDef,
  row: GridRow,
  range: NonNullable<QueryState["range"]>,
): boolean {
  const field = getField(def, range.field);
  if (!field) {
    return false;
  }
  const value = toComparable(field, row[field.key] ?? null);
  if (value === null) {
    return false;
  }
  const min = range.min === null ? null : toComparable(field, range.min);
  const max = range.max === null ? null : toComparable(field, range.max);
  return (min === null || value >= min) && (max === null || value <= max);
}

function matchesQuick(row: GridRow, fields: string[], needle: string): boolean {
  return fields
    .map((key) => String(row[key] ?? ""))
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export function filterRows(
  def: GridDef,
  rows: GridRow[],
  query: QueryState,
): GridRow[] {
  const equals = Object.entries(query.equals);
  const quickFields = listQuickFields(def);
  const needle = query.quick?.trim().toLowerCase() ?? null;
  return rows.filter(
    (row) =>
      equals.every(([key, value]) => String(row[key] ?? "") === value) &&
      (query.range === null || matchesRange(def, row, query.range)) &&
      (needle === null || matchesQuick(row, quickFields, needle)),
  );
}

function listLookupOptions(field: FieldDef, rows: GridRow[]): FieldOption[] {
  if (field.options) {
    return field.options;
  }
  const labelField = field.lookup?.labelField ?? field.key;
  const labels = new Map<string, string>();
  for (const row of rows) {
    const value = row[field.key];
    if (value !== null && value !== undefined) {
      labels.set(String(value), String(row[labelField] ?? value));
    }
  }
  return [...labels].map(([value, label]) => ({ value, label }));
}

function listAllTransitions(def: GridDef): [string, string][] {
  const options = def.facet ? getField(def, def.facet.field)?.options : null;
  const values = (options ?? []).map((option) => option.value);
  return values.flatMap((from) =>
    values
      .filter((to) => to !== from)
      .map((to): [string, string] => [from, to]),
  );
}

interface Selection {
  source: GridRow[];
  equals: QueryState["equals"];
  range: QueryState["range"];
  quick: QueryState["quick"];
  sort: SortState;
  rows: GridRow[];
}

export function createMemorySource(
  def: GridDef,
  initialRows: GridRow[],
  options: MemorySourceOptions = {},
): DataSource {
  let rows = initialRows;
  let selected: Selection | null = null;
  const select = (query: QueryState) => {
    const fresh =
      selected !== null &&
      selected.source === rows &&
      selected.equals === query.equals &&
      selected.range === query.range &&
      selected.quick === query.quick &&
      selected.sort === query.sort;
    if (!fresh) {
      selected = {
        source: rows,
        equals: query.equals,
        range: query.range,
        quick: query.quick,
        sort: query.sort,
        rows: sortRows(def, filterRows(def, rows, query), query.sort),
      };
    }
    return (selected as Selection).rows;
  };
  return {
    mode: "memory",
    fetchPage: async (query, limit) => {
      const offset = Number(query.cursor ?? 0) || 0;
      const matching = select(query);
      const end = offset + limit;
      const hasNext = end < matching.length;
      return {
        rows: matching.slice(offset, end),
        nextCursor: hasNext ? String(end) : null,
        hasNext,
      };
    },
    fetchCount: async (query) => ({
      count: filterRows(def, rows, query).length,
      capped: false,
      source: "exact",
    }),
    fetchTotal: async (query) => {
      const key = def.total?.field;
      if (!key) {
        return { available: false, reason: "This grid declares no total." };
      }
      const matching = filterRows(def, rows, query);
      return {
        available: true,
        sum: matching.reduce((sum, row) => sum + Number(row[key] ?? 0), 0),
        rows: matching.length,
        source: "live",
      };
    },
    fetchFacets: async (query) => {
      const key = def.facet?.field;
      if (!key) {
        return [];
      }
      const totalKey = def.total?.field;
      const others = Object.fromEntries(
        Object.entries(query.equals).filter(([name]) => name !== key),
      );
      const counts = new Map<string, FacetCount>();
      for (const row of filterRows(def, rows, { ...query, equals: others })) {
        const value = String(row[key] ?? "");
        const current = counts.get(value) ?? { value, count: 0, sum: 0 };
        counts.set(value, {
          value,
          count: current.count + 1,
          sum: (current.sum ?? 0) + (totalKey ? Number(row[totalKey] ?? 0) : 0),
        });
      }
      return [...counts.values()];
    },
    fetchOptions: async (key, search) => {
      const field = getField(def, key);
      if (!field) {
        return [];
      }
      const all = listLookupOptions(field, rows);
      if (search.value !== undefined) {
        return all.filter((option) => option.value === search.value);
      }
      const needle = (search.query ?? "").trim().toLowerCase();
      return all
        .filter((option) => option.label.toLowerCase().includes(needle))
        .slice(0, OPTION_LIMIT);
    },
    fetchTransitions: async () =>
      options.transitions ?? listAllTransitions(def),
    changeFacetValue: async (id, to) => {
      const key = def.facet?.field;
      const current = rows.find((row) => row.id === id);
      if (!key || !current) {
        throw new Error("unknown row");
      }
      const updated: GridRow = { ...current, [key]: to };
      rows = rows.map((row) => (row.id === id ? updated : row));
      return updated;
    },
  };
}
