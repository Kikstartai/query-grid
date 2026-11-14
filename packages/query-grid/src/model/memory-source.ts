import type { DataSource } from "./data-source.ts";
import {
  getField,
  type Capabilities,
  type FieldDef,
  type FieldOption,
  type GridDef,
  type GridRow,
  type QueryState,
  type SortState,
} from "./field-types.ts";
import { SourceError } from "./problems.ts";
import { sortRows, toComparable } from "./sort-rows.ts";
import type { FacetCount } from "./wire-types.ts";

const OPTION_LIMIT = 50;

export interface MemorySourceOptions {
  quick?: string[];
  transitions?: [string, string][];
}

export function memoryCapabilities(
  def: GridDef,
  quickFields: string[] = [],
): Capabilities {
  const offers = (key: string, operator: "eq" | "range") =>
    getField(def, key)?.operators.includes(operator) === true;
  return {
    mode: "memory",
    isAnswerable: (query) =>
      Object.keys(query.equals).every((key) => offers(key, "eq")) &&
      (query.range === null || offers(query.range.field, "range")) &&
      (query.quick === null || quickFields.length > 0) &&
      getField(def, query.sort.field) !== null,
    sortFields: def.fields.map((field) => field.key),
    quickFields,
    isFacetCountShown: () => true,
  };
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
  quickFields: string[] = [],
): GridRow[] {
  const equals = Object.entries(query.equals);
  const needle = query.quick?.trim().toLowerCase() ?? null;
  return rows.filter(
    (row) =>
      equals.every(([key, values]) =>
        values.includes(String(row[key] ?? "")),
      ) &&
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
  const quickFields = options.quick ?? [];
  const matching = (query: QueryState) =>
    filterRows(def, rows, query, quickFields);
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
        rows: sortRows(def, matching(query), query.sort),
      };
    }
    return (selected as Selection).rows;
  };
  return {
    capabilities: memoryCapabilities(def, quickFields),
    fetchPage: async (query, limit) => {
      const offset = Number(query.cursor ?? 0) || 0;
      const found = select(query);
      const end = offset + limit;
      const hasNext = end < found.length;
      return {
        rows: found.slice(offset, end),
        nextCursor: hasNext ? String(end) : null,
        hasNext,
      };
    },
    fetchCount: async (query) => ({
      count: matching(query).length,
      capped: false,
      source: "exact",
    }),
    fetchTotal: async (query) => {
      const key = def.total?.field;
      if (!key) {
        return { available: false, code: "no_total", params: {} };
      }
      const found = matching(query);
      return {
        available: true,
        sum: found.reduce((sum, row) => sum + Number(row[key] ?? 0), 0),
        rows: found.length,
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
      for (const row of matching({ ...query, equals: others })) {
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
        throw new SourceError("unknown_row", { id });
      }
      const updated: GridRow = { ...current, [key]: to };
      rows = rows.map((row) => (row.id === id ? updated : row));
      return updated;
    },
  };
}
