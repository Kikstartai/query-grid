"use client";

import { createContext, use, type ReactNode } from "react";

import {
  DEFAULT_LOCALE,
  formatCount,
  type GridFormat,
  type Problem,
  type ProblemParams,
  type ReasonCode,
} from "@kikstart/query-grid";

type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & {
  other: string;
};

export interface CountParams {
  count: number;
  formatted: string;
  locale: string;
}

export interface LabelParams {
  label: string;
}

export interface ReasonParams {
  label: string;
  blockers: string;
}

type MessageParams = Record<string, string | number>;

export interface QueryGridMessages {
  loading: string;
  noRows: string;
  rows: (params: CountParams) => string;
  rowsCapped: (params: CountParams) => string;
  loaded: (params: { rows: string }) => string;
  loadedInPages: (params: {
    rows: string;
    pages: number;
    locale: string;
  }) => string;
  view: string;
  countUnavailable: string;
  counting: string;
  exactCount: string;
  countSources: Record<"counter" | "capped" | "exact" | "underCap", string>;
  noTotal: string;
  totalling: string;
  total: string;
  totalSum: (params: LabelParams) => string;
  totalFromCounter: (params: { rows: string }) => string;
  totalLive: (params: { rows: string }) => string;
  filters: string;
  closeFilters: string;
  filtersDescription: string;
  reset: string;
  done: string;
  all: string;
  facetNotes: Record<"memory" | "counter" | "hidden", string>;
  sort: string;
  sortBy: string;
  ascending: string;
  descending: string;
  quickFilter: string;
  quickPlaceholder: (params: { fields: string }) => string;
  quickHint: (params: { min: number; max: number }) => string;
  clearQuickFilter: string;
  activeFilters: string;
  removeChip: (params: LabelParams) => string;
  chipEquals: (params: LabelParams) => string;
  chipRange: (params: { label: string; min: string; max: string }) => string;
  chipQuick: (params: { value: string }) => string;
  chipSort: (params: { label: string; direction: string }) => string;
  openBound: string;
  any: string;
  moreValues: (params: { count: number }) => string;
  fieldFilter: (params: LabelParams) => string;
  clearField: (params: LabelParams) => string;
  searchField: (params: LabelParams) => string;
  noMatch: string;
  rangeFrom: (params: LabelParams) => string;
  rangeTo: (params: LabelParams) => string;
  from: string;
  to: string;
  pickDates: (params: LabelParams) => string;
  min: string;
  max: string;
  selectRow: string;
  selectAll: string;
  columns: string;
  pinColumn: (params: LabelParams) => string;
  resetColumns: string;
  feedLoading: string;
  feedCapped: string;
  feedEnd: string;
  selected: (params: { count: number }) => string;
  activeCell: (params: { cell: string }) => string;
  cellRange: (params: { range: string }) => string;
  none: string;
  sortByField: (params: LabelParams) => string;
  filterField: (params: LabelParams) => string;
  resizeColumn: (params: LabelParams) => string;
  boardHelp: string;
  boardUnavailable: string;
  moveFailed: string;
  reasons: Record<ReasonCode, (params: ReasonParams) => string>;
  reasonParts: Record<"filter" | "range" | "sort", (label: string) => string>;
  errors: Record<string, (params: MessageParams) => string>;
  errorFallback: (params: { code: string }) => string;
}

type NestedKey = "countSources" | "facetNotes" | "reasons" | "reasonParts";

export type QueryGridMessageOverrides = Partial<
  Omit<QueryGridMessages, NestedKey | "errors">
> & {
  [K in NestedKey]?: Partial<QueryGridMessages[K]>;
} & { errors?: QueryGridMessages["errors"] };

export function selectPlural(
  locale: string,
  count: number,
  forms: PluralForms,
): string {
  return forms[new Intl.PluralRules(locale).select(count)] ?? forms.other;
}

export function formatList(locale: string, items: string[]): string {
  return new Intl.ListFormat(locale, {
    style: "long",
    type: "conjunction",
  }).format(items);
}

export const DEFAULT_MESSAGES: QueryGridMessages = {
  loading: "Loading…",
  noRows: "No rows match.",
  rows: ({ count, formatted, locale }) =>
    `${formatted} ${selectPlural(locale, count, { one: "row", other: "rows" })}`,
  rowsCapped: ({ formatted }) => `${formatted}+ rows`,
  loaded: ({ rows }) => `${rows} loaded`,
  loadedInPages: ({ rows, pages, locale }) =>
    `${rows} loaded in ${pages} keyset ${selectPlural(locale, pages, { one: "page", other: "pages" })}`,
  view: "View",
  countUnavailable: "Count unavailable",
  counting: "Counting…",
  exactCount: "Exact count",
  countSources: {
    counter: "exact, from the counter table",
    capped: "capped count",
    exact: "exact count",
    underCap: "exact, counted under the cap",
  },
  noTotal: "No total for this filter.",
  totalling: "Totalling…",
  total: "Total",
  totalSum: ({ label }) => `${label} sum`,
  totalFromCounter: ({ rows }) => `from the counter table, ${rows}`,
  totalLive: ({ rows }) => `summed live over ${rows}`,
  filters: "Filters",
  closeFilters: "Close filters",
  filtersDescription:
    "A control is offered only when an index answers it with the current filters and sort. A disabled control says what blocks it.",
  reset: "Reset",
  done: "Done",
  all: "All",
  facetNotes: {
    memory: "Counts follow the other filters.",
    counter: "Counts come from a trigger-maintained counter table.",
    hidden:
      "Counts are hidden while another filter is active: no counter answers them.",
  },
  sort: "Sort",
  sortBy: "Sort by",
  ascending: "Ascending",
  descending: "Descending",
  quickFilter: "Quick filter",
  quickPlaceholder: ({ fields }) => `Quick filter: ${fields}`,
  quickHint: ({ min, max }) => `${min} to ${max} characters`,
  clearQuickFilter: "Clear quick filter",
  activeFilters: "Active filters and sort",
  removeChip: ({ label }) => `Remove ${label}`,
  chipEquals: ({ label }) => `${label}:`,
  chipRange: ({ label, min, max }) => `${label}: ${min} – ${max}`,
  chipQuick: ({ value }) => `Quick filter: “${value}”`,
  chipSort: ({ label, direction }) => `Sort: ${label} ${direction}`,
  openBound: "…",
  any: "any",
  moreValues: ({ count }) => `${count} more`,
  fieldFilter: ({ label }) => `${label} filter`,
  clearField: ({ label }) => `Clear ${label}`,
  searchField: ({ label }) => `${label}: search…`,
  noMatch: "No match.",
  rangeFrom: ({ label }) => `${label} from`,
  rangeTo: ({ label }) => `${label} to`,
  from: "from",
  to: "to",
  pickDates: ({ label }) => `Pick ${label} dates`,
  min: "min",
  max: "max",
  selectRow: "Select row",
  selectAll: "Select all loaded rows",
  columns: "Columns",
  pinColumn: ({ label }) => `Pin ${label}`,
  resetColumns: "Reset columns",
  feedLoading: "loading…",
  feedCapped: "result capped, refine the filter",
  feedEnd: "end of results",
  selected: ({ count }) => `${count} selected`,
  activeCell: ({ cell }) => `cell ${cell}`,
  cellRange: ({ range }) => `range ${range}`,
  none: "none",
  sortByField: ({ label }) => `Sort by ${label}`,
  filterField: ({ label }) => `Filter ${label}`,
  resizeColumn: ({ label }) => `Resize ${label}`,
  boardHelp:
    "Drag a card, or press Space on it and use the arrow keys, to change its status. A column the card may not move to is skipped, and a drop outside the column it is shown in puts it back.",
  boardUnavailable:
    "No index answers the board with these filters. Clear the filters the board cannot combine with a status.",
  moveFailed: "The move failed",
  reasons: {
    quick_alone: () =>
      "The quick filter runs alone: clear the other filters first.",
    quick_unordered: () =>
      "A quick filter result is unordered until every match is loaded: narrow it under the cap to sort.",
    quick_no_combine: () =>
      "No index combines the quick filter with another filter.",
    no_sort_index: ({ label }) => `No index sorts by ${label}.`,
    range_needs_sort: ({ label }) =>
      `No index answers a ${label} range unless the sort is ${label}.`,
    no_sort_with: ({ label, blockers }) =>
      `No index sorts by ${label} with ${blockers}.`,
    no_filter_with: ({ label, blockers }) =>
      `No index answers ${label} with ${blockers}.`,
    no_range_with: ({ label, blockers }) =>
      `No index answers a ${label} range with ${blockers}.`,
  },
  reasonParts: {
    filter: (label) => `the ${label} filter`,
    range: (label) => `the ${label} range`,
    sort: (label) => `sort ${label}`,
  },
  errors: {
    undeclared_shape: () =>
      "No declared query shape answers this filter and sort.",
    unknown_field: ({ field }) => `Unknown field ${field}.`,
    invalid_value: ({ field }) => `Invalid value for ${field}.`,
    too_many_values: ({ field, max }) =>
      `${field} takes at most ${max} values.`,
    quick_length: ({ min, max }) =>
      `The quick filter needs ${min} to ${max} characters.`,
    invalid_sort_direction: () => "Invalid sort direction.",
    invalid_cursor: () => "The cursor does not decode.",
    invalid_limit: () => "The page size is not a number.",
    too_broad: () =>
      "That quick filter matches too much to answer fast. Add more characters.",
    transition_refused: ({ to }) => `A move to ${to} is not allowed.`,
    unknown_row: () => "That row no longer exists.",
    no_total: () => "This grid declares no total.",
    over_cap: ({ cap }) =>
      `More than ${cap} rows match and no counter totals this filter.`,
    not_found: () => "The server does not answer this request.",
    internal: () => "The query failed.",
    request_failed: () => "The request failed.",
  },
  errorFallback: ({ code }) => `The request failed (${code}).`,
};

function mergeMessages(
  overrides: QueryGridMessageOverrides,
): QueryGridMessages {
  return {
    ...DEFAULT_MESSAGES,
    ...overrides,
    countSources: {
      ...DEFAULT_MESSAGES.countSources,
      ...overrides.countSources,
    },
    facetNotes: { ...DEFAULT_MESSAGES.facetNotes, ...overrides.facetNotes },
    reasons: { ...DEFAULT_MESSAGES.reasons, ...overrides.reasons },
    reasonParts: { ...DEFAULT_MESSAGES.reasonParts, ...overrides.reasonParts },
    errors: { ...DEFAULT_MESSAGES.errors, ...overrides.errors },
  };
}

const MessagesContext = createContext<QueryGridMessages>(DEFAULT_MESSAGES);

export interface QueryGridMessagesProviderProps {
  messages: QueryGridMessageOverrides;
  children: ReactNode;
}

export function QueryGridMessagesProvider({
  messages,
  children,
}: QueryGridMessagesProviderProps) {
  return (
    <MessagesContext value={mergeMessages(messages)}>
      {children}
    </MessagesContext>
  );
}

export function useMessages(): QueryGridMessages {
  return use(MessagesContext);
}

export function resolveLocale(format: GridFormat | undefined): string {
  return format?.locale ?? DEFAULT_LOCALE;
}

export function formatRows(
  messages: QueryGridMessages,
  count: number,
  format?: GridFormat,
): string {
  return messages.rows({
    count,
    formatted: formatCount(count, format),
    locale: resolveLocale(format),
  });
}

export function formatLoaded(
  messages: QueryGridMessages,
  rows: number,
  pages: number | undefined,
  format?: GridFormat,
): string {
  const text = formatRows(messages, rows, format);
  if (pages === undefined) {
    return messages.loaded({ rows: text });
  }
  return messages.loadedInPages({
    rows: text,
    pages,
    locale: resolveLocale(format),
  });
}

function formatParams(
  params: ProblemParams,
  format: GridFormat | undefined,
): MessageParams {
  return Object.fromEntries(
    Object.entries(params).map(([name, value]) => [
      name,
      typeof value === "number" ? formatCount(value, format) : value,
    ]),
  );
}

export function formatProblemMessage(
  messages: QueryGridMessages,
  problem: Problem,
  format?: GridFormat,
): string {
  const render = messages.errors[problem.code];
  return render
    ? render(formatParams(problem.params, format))
    : messages.errorFallback({ code: problem.code });
}
