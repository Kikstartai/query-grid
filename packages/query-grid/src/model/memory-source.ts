import { encodeCsv, listExportFields } from "./csv.ts";
import type { DataSource, GroupHeader } from "./data-source.ts";
import {
  getFacetField,
  getField,
  listSearchFields,
  listTotalFields,
  type BaseFieldDef,
  type FieldOption,
  type BaseGridDef,
  type GridRow,
} from "./grid-def.ts";
import type { QueryState } from "./query-state.ts";
import type { DataSourceCapabilities } from "./capabilities.ts";
import { matchesFilter } from "./filter-values.ts";
import { GROUP_LIMIT, sortGroups, toGroupValue } from "./groups.ts";
import {
  hasFilterOps,
  hasValidThenBy,
  isCombineOr,
  listGroupFields,
} from "./indexes.ts";
import { sameFilters } from "./load.ts";
import { isLiteralOp, listFieldOps, resolveFieldKind } from "./operators.ts";
import { SourceError } from "./problems.ts";
import { withLiteralFilters } from "./literal-filters.ts";
import { reorderRows } from "./reorder.ts";
import { sortRows } from "./sort-rows.ts";

const OPTION_LIMIT = 50;

export function memoryCapabilities(def: BaseGridDef): DataSourceCapabilities {
  const searchFields = listSearchFields(def);
  const filterOps = Object.fromEntries(
    def.fields.map((field) => [
      field.key,
      listFieldOps(field).filter((op) => !isLiteralOp(field, op)),
    ]),
  );
  const valueFields = def.fields
    .filter((field) => {
      const kind = resolveFieldKind(field);
      return kind === "choice" || kind === "text";
    })
    .map((field) => field.key);
  const groupFields = listGroupFields(def.fields, valueFields);
  const sortFields = def.fields.map((field) => field.key);
  return {
    holdsAllRows: true,
    searchIsOrdered: true,
    facetCountsFollowFilters: true,
    narrowLimited: false,
    combineOr: true,
    isNarrowed: () => false,
    narrowBasis: () => "",
    filterOps,
    groupFields,
    canRun: (query) =>
      (query.group === null ||
        (!isCombineOr(query) && groupFields.includes(query.group))) &&
      hasFilterOps(filterOps, query) &&
      (query.search === null || searchFields.length > 0) &&
      sortFields.includes(query.sort.field) &&
      hasValidThenBy(query, sortFields),
    sortFields,
    thenByFields: sortFields,
    sortOrders: [],
    searchFields,
    isFacetCountExact: () => true,
  };
}

function matchesSearch(
  row: GridRow,
  fields: string[],
  needle: string,
): boolean {
  return fields
    .map((key) => String(row[key] ?? ""))
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

type RowTest = (row: GridRow) => boolean;

function listRowTests(def: BaseGridDef, query: QueryState): RowTest[] {
  return query.filters.map((filter) => {
    const field = getField(def, filter.field);
    return (row) =>
      field !== null && matchesFilter(field, filter, row[filter.field]);
  });
}

export function filterRows(
  def: BaseGridDef,
  rows: GridRow[],
  query: QueryState,
  searchFields: string[] = [],
): GridRow[] {
  const tests = listRowTests(def, query);
  const or = isCombineOr(query);
  const needle = query.search?.trim().toLowerCase() ?? null;
  return rows.filter(
    (row) =>
      (or
        ? tests.some((test) => test(row))
        : tests.every((test) => test(row))) &&
      (needle === null || matchesSearch(row, searchFields, needle)),
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
    if (Array.isArray(value)) {
      value.forEach((item) => labels.set(item, item));
      continue;
    }
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

interface FacetTally {
  value: string;
  count: number;
  sums: Record<string, number>;
}

function emptySums(fields: string[]): Record<string, number> {
  return Object.fromEntries(fields.map((field) => [field, 0]));
}

function addToSums(
  sums: Record<string, number>,
  fields: string[],
  row: GridRow,
): void {
  for (const field of fields) {
    sums[field] += Number(row[field] ?? 0);
  }
}

interface Selection {
  source: GridRow[];
  query: QueryState;
  rows: GridRow[];
}

export function createMemorySource(
  def: BaseGridDef,
  initialRows: GridRow[],
): DataSource {
  let rows = initialRows;
  let selected: Selection | null = null;
  const searchFields = listSearchFields(def);
  const totals = listTotalFields(def).map((field) => field.key);
  const matching = (query: QueryState) =>
    filterRows(def, rows, query, searchFields);
  const select = (query: QueryState) => {
    const fresh =
      selected !== null &&
      selected.source === rows &&
      selected.query.sort === query.sort &&
      selected.query.thenBy === query.thenBy &&
      sameFilters(selected.query, query);
    if (!fresh) {
      selected = {
        source: rows,
        query,
        rows: sortRows(def, matching(query), query.sort, query.thenBy),
      };
    }
    return (selected as Selection).rows;
  };
  return withLiteralFilters(def, {
    capabilities: memoryCapabilities(def),
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
    fetchTotals: async (query) => {
      const found = matching(query);
      const sums = emptySums(totals);
      for (const row of found) {
        addToSums(sums, totals, row);
      }
      return totals.map((field) => ({
        field,
        available: true,
        sum: sums[field],
        rows: found.length,
        source: "live",
      }));
    },
    fetchFacets: async (query) => {
      const key = def.facet?.field;
      if (!key) {
        return [];
      }
      const others = query.filters.filter((filter) => filter.field !== key);
      const tallies = new Map<string, FacetTally>();
      for (const row of matching({ ...query, filters: others })) {
        const value = String(row[key] ?? "");
        const tally = tallies.get(value) ?? {
          value,
          count: 0,
          sums: emptySums(totals),
        };
        tally.count += 1;
        addToSums(tally.sums, totals, row);
        tallies.set(value, tally);
      }
      return [...tallies.values()];
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
    fetchGroups: async (query) => {
      const key = query.group;
      if (key === null) {
        return { groups: [], source: "live", truncated: false };
      }
      const field = getField(def, key);
      const labelField = field?.lookup?.labelField;
      const headers = new Map<string, GroupHeader>();
      for (const row of matching(query)) {
        const value = toGroupValue(field, row[key]);
        if (value === null) {
          continue;
        }
        const known = headers.get(value);
        const sums = known?.sums ?? emptySums(totals);
        addToSums(sums, totals, row);
        headers.set(value, {
          value,
          label: labelField ? String(row[labelField] ?? value) : null,
          count: (known?.count ?? 0) + 1,
          capped: false,
          sums,
        });
      }
      const groups = sortGroups(def, key, [...headers.values()]);
      return {
        groups: groups.slice(0, GROUP_LIMIT),
        source: "live",
        truncated: groups.length > GROUP_LIMIT,
      };
    },
    fetchNarrowed: async () => null,
    fetchLimits: async () => null,
    fetchExport: async (query, request) =>
      encodeCsv(listExportFields(def, request.columns), select(query)),
    fetchTransitions: async () => listAllTransitions(def),
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
    reorderRow: async (move) => {
      const field = def.orderField;
      if (!field || !rows.some((row) => row.id === move.id)) {
        throw new SourceError("unknown_row", { id: move.id });
      }
      const changed = reorderRows(field, rows, move);
      const byId = new Map(changed.map((row) => [row.id, row]));
      rows = rows.map((row) => byId.get(row.id) ?? row);
      return changed;
    },
  });
}
