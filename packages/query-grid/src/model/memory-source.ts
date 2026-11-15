import type { DataSource } from "./data-source.ts";
import {
  getFacetField,
  getField,
  isRangeType,
  listSearchFields,
  listTotalFields,
  type RunnableQueries,
  type BaseFieldDef,
  type FieldOption,
  type BaseGridDef,
  type GridRow,
  type QueryState,
  type RangeState,
} from "./field-types.ts";
import { matchesEquals } from "./field-values.ts";
import { GROUP_LIMIT, sortGroups, toGroupValue } from "./groups.ts";
import { isMatchAny, listContainsFields, listGroupFields } from "./indexes.ts";
import { sameFilters } from "./load.ts";
import { SourceError } from "./problems.ts";
import { withQueryResolution, type SourceOptions } from "./query-resolve.ts";
import type { GroupHeader } from "./wire-types.ts";
import { withoutKey } from "./query-actions.ts";
import { sortRows, toComparable } from "./sort-rows.ts";

const OPTION_LIMIT = 50;

export function memoryRunnable(def: BaseGridDef): RunnableQueries {
  const searchFields = listSearchFields(def);
  const ranged = (field: BaseFieldDef) =>
    isRangeType(field.type) && !field.options;
  const rangeFields = def.fields.filter(ranged).map((field) => field.key);
  const equalsFields = def.fields
    .filter((field) => !ranged(field))
    .map((field) => field.key);
  const containsFields = listContainsFields(def.fields);
  return {
    holdsAllRows: true,
    searchIsOrdered: true,
    facetCountsFollowFilters: true,
    narrowLimited: false,
    matchAny: true,
    isNarrowed: () => false,
    narrowBasis: () => "",
    containsFields,
    groupFields: listGroupFields(def.fields, equalsFields),
    canRun: (query) =>
      (query.group === null ||
        (!isMatchAny(query) &&
          listGroupFields(def.fields, equalsFields).includes(query.group))) &&
      Object.keys(query.equals).every((key) => equalsFields.includes(key)) &&
      query.ranges.every((range) => rangeFields.includes(range.field)) &&
      (query.contains === null ||
        containsFields.includes(query.contains.field)) &&
      (query.search === null || searchFields.length > 0) &&
      getField(def, query.sort.field) !== null,
    equalsFields,
    rangeFields,
    sortFields: def.fields.map((field) => field.key),
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
    return false;
  }
  const min = range.min === null ? null : toComparable(field, range.min);
  const max = range.max === null ? null : toComparable(field, range.max);
  return (min === null || value >= min) && (max === null || value <= max);
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
  if (query.contains) {
    const { field, value } = query.contains;
    const part = value.trim().toLowerCase();
    tests.push((row) =>
      String(row[field] ?? "")
        .toLowerCase()
        .includes(part),
    );
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
  options: SourceOptions = {},
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
  return withQueryResolution(
    def,
    {
      runnable: memoryRunnable(def),
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
          const header = headers.get(value) ?? {
            value,
            label: labelField ? String(row[labelField] ?? value) : null,
            count: 0,
            capped: false,
            sums: emptySums(totals),
          };
          header.count += 1;
          addToSums(header.sums ?? {}, totals, row);
          headers.set(value, header);
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
    },
    options,
  );
}
