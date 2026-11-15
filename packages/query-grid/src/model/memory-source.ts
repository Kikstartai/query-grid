import type { DataSource } from "./data-source.ts";
import {
  getFacetField,
  getField,
  isRangeType,
  type Capabilities,
  type BaseFieldDef,
  type FieldOption,
  type BaseGridDef,
  type GridRow,
  type QueryState,
} from "./field-types.ts";
import { sameFilters } from "./load.ts";
import { SourceError } from "./problems.ts";
import { withoutKey } from "./query-actions.ts";
import { sortRows, toComparable } from "./sort-rows.ts";
import type { FacetCount } from "./wire-types.ts";

const OPTION_LIMIT = 50;

export interface MemorySourceOptions {
  quick?: string[];
  transitions?: [string, string][];
}

export function memoryCapabilities(
  def: BaseGridDef,
  quickFields: string[] = [],
): Capabilities {
  const ranged = (field: BaseFieldDef) =>
    isRangeType(field.type) && !field.options;
  const rangeFields = def.fields.filter(ranged).map((field) => field.key);
  const equalsFields = def.fields
    .filter((field) => !ranged(field))
    .map((field) => field.key);
  return {
    mode: "memory",
    isAnswerable: (query) =>
      Object.keys(query.equals).every((key) => equalsFields.includes(key)) &&
      (query.range === null || rangeFields.includes(query.range.field)) &&
      (query.quick === null || quickFields.length > 0) &&
      getField(def, query.sort.field) !== null,
    equalsFields,
    rangeFields,
    sortFields: def.fields.map((field) => field.key),
    quickFields,
    isFacetCountShown: () => true,
  };
}

function matchesRange(
  def: BaseGridDef,
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
  def: BaseGridDef,
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

function listLookupOptions(
  field: BaseFieldDef,
  rows: GridRow[],
): FieldOption[] {
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

function listAllTransitions(def: BaseGridDef): [string, string][] {
  const values = (getFacetField(def)?.options ?? []).map(
    (option) => option.value,
  );
  return values.flatMap((from) =>
    values
      .filter((to) => to !== from)
      .map((to): [string, string] => [from, to]),
  );
}

interface Selection {
  source: GridRow[];
  query: QueryState;
  rows: GridRow[];
}

export function createMemorySource(
  def: BaseGridDef,
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
      selected.query.sort === query.sort &&
      sameFilters(selected.query, query);
    if (!fresh) {
      selected = {
        source: rows,
        query,
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
      const others = withoutKey(query.equals, key);
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
