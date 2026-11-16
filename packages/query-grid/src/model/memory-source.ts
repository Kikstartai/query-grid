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
import type { QueryState, RangeState, TextState } from "./query-state.ts";
import type { DataSourceCapabilities } from "./capabilities.ts";
import { matchesEquals } from "./field-values.ts";
import { GROUP_LIMIT, sortGroups, toGroupValue } from "./groups.ts";
import {
  hasValidThenBy,
  isMatchAny,
  listGroupFields,
  listNarrowRangeFields,
  listOverlapFields,
  listTextFields,
} from "./indexes.ts";
import { sameFilters } from "./load.ts";
import { SourceError } from "./problems.ts";
import { withLiteralFilters } from "./literal-filters.ts";
import { withoutKey } from "./query-actions.ts";
import { reorderRows } from "./reorder.ts";
import { sortRows, toComparable } from "./sort-rows.ts";

const OPTION_LIMIT = 50;

export function memoryCapabilities(def: BaseGridDef): DataSourceCapabilities {
  const searchFields = listSearchFields(def);
  const rangeFields = listNarrowRangeFields(def.fields);
  const overlapFields = listOverlapFields(def.fields);
  const equalsFields = def.fields
    .map((field) => field.key)
    .filter(
      (key) => !rangeFields.includes(key) && !overlapFields.includes(key),
    );
  const textFields = listTextFields(def.fields);
  const groupFields = listGroupFields(def.fields, equalsFields);
  const sortFields = def.fields.map((field) => field.key);
  return {
    holdsAllRows: true,
    searchIsOrdered: true,
    facetCountsFollowFilters: true,
    narrowLimited: false,
    matchAny: true,
    isNarrowed: () => false,
    narrowBasis: () => "",
    textFields,
    overlapFields,
    groupFields,
    canRun: (query) =>
      (query.group === null ||
        (!isMatchAny(query) && groupFields.includes(query.group))) &&
      Object.keys(query.equals).every((key) => equalsFields.includes(key)) &&
      query.ranges.every((range) => rangeFields.includes(range.field)) &&
      query.texts.every((text) => textFields.includes(text.field)) &&
      Object.keys(query.overlaps).every((key) => overlapFields.includes(key)) &&
      (query.search === null || searchFields.length > 0) &&
      sortFields.includes(query.sort.field) &&
      hasValidThenBy(query, sortFields),
    equalsFields,
    rangeFields,
    sortFields,
    thenByFields: sortFields,
    sortOrders: [],
    searchFields,
    isFacetCountExact: () => true,
  };
}

function matchesRange(
  def: BaseGridDef,
  row: GridRow,
  range: RangeState,
): boolean {
  const field = getField(def, range.field);
  if (!field) {
    return false;
  }
  const value = toComparable(field, row[field.key] ?? null);
  if (value === null) {
    return range.exclude === true;
  }
  const min = range.min === null ? null : toComparable(field, range.min);
  const max = range.max === null ? null : toComparable(field, range.max);
  const above =
    min === null || (range.minExclusive ? value > min : value >= min);
  const below =
    max === null || (range.maxExclusive ? value < max : value <= max);
  return (above && below) !== (range.exclude === true);
}

type CellTest = (cell: string | null) => boolean;

function createTextTest({ op, value }: TextState): CellTest {
  const part = value.trim();
  const needle = part.toLowerCase();
  switch (op) {
    case "contains":
      return (cell) => cell !== null && cell.toLowerCase().includes(needle);
    case "not_contains":
      return (cell) => cell === null || !cell.toLowerCase().includes(needle);
    case "starts_with":
      return (cell) => cell !== null && cell.toLowerCase().startsWith(needle);
    case "ends_with":
      return (cell) => cell !== null && cell.toLowerCase().endsWith(needle);
    case "not_equals":
      return (cell) => cell !== part;
  }
}

function toTextCell(row: GridRow, key: string): string | null {
  const raw = row[key];
  return raw === null || raw === undefined ? null : String(raw);
}

function matchesOverlap(row: GridRow, key: string, values: string[]): boolean {
  const cell = row[key];
  return Array.isArray(cell) && values.some((value) => cell.includes(value));
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
  const tests: RowTest[] = [];
  for (const [key, values] of Object.entries(query.equals)) {
    const field = getField(def, key);
    tests.push((row) => matchesEquals(field, values, row[key]));
  }
  for (const range of query.ranges) {
    tests.push((row) => matchesRange(def, row, range));
  }
  for (const text of query.texts) {
    const test = createTextTest(text);
    tests.push((row) => test(toTextCell(row, text.field)));
  }
  for (const [key, values] of Object.entries(query.overlaps)) {
    tests.push((row) => matchesOverlap(row, key, values));
  }
  return tests;
}

export function filterRows(
  def: BaseGridDef,
  rows: GridRow[],
  query: QueryState,
  searchFields: string[] = [],
): GridRow[] {
  const tests = listRowTests(def, query);
  const any = isMatchAny(query);
  const needle = query.search?.trim().toLowerCase() ?? null;
  return rows.filter(
    (row) =>
      (any
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
      const others = withoutKey(query.equals, key);
      const tallies = new Map<string, FacetTally>();
      for (const row of matching({ ...query, equals: others })) {
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
