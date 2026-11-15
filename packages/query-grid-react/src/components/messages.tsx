"use client";

import { createContext, use, type ReactNode } from "react";

import {
  DEFAULT_LOCALE,
  formatCount,
  type Problem,
  type ProblemParams,
  type ReasonCode,
  type ReservedValue,
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
  totalSum: (params: LabelParams) => string;
  totalFromCounter: (params: { rows: string }) => string;
  totalLive: (params: { rows: string }) => string;
  filters: string;
  closeFilters: string;
  filtersDescription: string;
  reset: string;
  done: string;
  all: string;
  facetNotes: Record<"following" | "counter" | "hidden", string>;
  sort: string;
  sortBy: string;
  ascending: string;
  descending: string;
  searchFilter: string;
  searchPlaceholder: (params: { fields: string }) => string;
  searchHint: (params: { min: number; max: number }) => string;
  clearSearchFilter: string;
  activeFilters: string;
  removeChip: (params: LabelParams) => string;
  chipEquals: (params: LabelParams) => string;
  chipRange: (params: { label: string; min: string; max: string }) => string;
  chipSearch: (params: { value: string }) => string;
  chipSort: (params: { label: string; direction: string }) => string;
  openBound: string;
  any: string;
  emptyValue: string;
  notEmptyValue: string;
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

const pluralRules = new Map<string, Intl.PluralRules>();
const listFormats = new Map<string, Intl.ListFormat>();

export function selectPlural(
  locale: string,
  count: number,
  forms: PluralForms,
): string {
  const rules = pluralRules.get(locale) ?? new Intl.PluralRules(locale);
  pluralRules.set(locale, rules);
  return forms[rules.select(count)] ?? forms.other;
}

export function formatList(locale: string, items: string[]): string {
  const format =
    listFormats.get(locale) ??
    new Intl.ListFormat(locale, { style: "long", type: "conjunction" });
  listFormats.set(locale, format);
  return format.format(items);
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
    following: "Counts follow the other filters.",
    counter: "Counts come from a trigger-maintained counter table.",
    hidden:
      "Counts are hidden while another filter is active: no counter answers them.",
  },
  sort: "Sort",
  sortBy: "Sort by",
  ascending: "Ascending",
  descending: "Descending",
  searchFilter: "Search",
  searchPlaceholder: ({ fields }) => `Search: ${fields}`,
  searchHint: ({ min, max }) => `${min} to ${max} characters`,
  clearSearchFilter: "Clear search",
  activeFilters: "Active filters and sort",
  removeChip: ({ label }) => `Remove ${label}`,
  chipEquals: ({ label }) => `${label}:`,
  chipRange: ({ label, min, max }) => `${label}: ${min} – ${max}`,
  chipSearch: ({ value }) => `Search: “${value}”`,
  chipSort: ({ label, direction }) => `Sort: ${label} ${direction}`,
  openBound: "…",
  any: "any",
  emptyValue: "(empty)",
  notEmptyValue: "(not empty)",
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
    search_alone: () => "The search runs alone: clear the other filters first.",
    search_unordered: () =>
      "A search result is unordered until every match is loaded: narrow it under the cap to sort.",
    search_no_combine: () =>
      "No index combines the search with another filter.",
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
    unindexed_query: () => "No declared index answers this filter and sort.",
    unknown_field: ({ field }) => `Unknown field ${field}.`,
    invalid_value: ({ field }) => `Invalid value for ${field}.`,
    too_many_values: ({ field, max }) =>
      `${field} takes at most ${max} values.`,
    search_length: ({ min, max }) =>
      `The search needs ${min} to ${max} characters.`,
    invalid_sort_direction: () => "Invalid sort direction.",
    invalid_cursor: () => "The cursor does not decode.",
    invalid_limit: () => "The page size is not a number.",
    too_broad: () =>
      "That search matches too much to answer fast. Add more characters.",
    transition_refused: ({ to }) => `A move to ${to} is not allowed.`,
    unknown_row: () => "That row no longer exists.",
    over_cap: ({ cap }) =>
      `More than ${cap} rows match and no counter totals this filter.`,
    not_found: () => "The server does not answer this request.",
    internal: () => "The query failed.",
    request_failed: () => "The request failed.",
  },
  errorFallback: ({ code }) => `The request failed (${code}).`,
};

function mergeMessages(
  base: QueryGridMessages,
  overrides: QueryGridMessageOverrides,
): QueryGridMessages {
  return {
    ...base,
    ...overrides,
    countSources: { ...base.countSources, ...overrides.countSources },
    facetNotes: { ...base.facetNotes, ...overrides.facetNotes },
    reasons: { ...base.reasons, ...overrides.reasons },
    reasonParts: { ...base.reasonParts, ...overrides.reasonParts },
    errors: { ...base.errors, ...overrides.errors },
  };
}

interface MessagesContextValue {
  messages: QueryGridMessages;
  locale: string;
}

const MessagesContext = createContext<MessagesContextValue>({
  messages: DEFAULT_MESSAGES,
  locale: DEFAULT_LOCALE,
});

export interface QueryGridMessagesProviderProps {
  messages?: QueryGridMessageOverrides;
  locale?: string;
  children: ReactNode;
}

export function QueryGridMessagesProvider({
  messages = {},
  locale,
  children,
}: QueryGridMessagesProviderProps) {
  const outer = use(MessagesContext);
  return (
    <MessagesContext
      value={{
        messages: mergeMessages(outer.messages, messages),
        locale: locale ?? outer.locale,
      }}
    >
      {children}
    </MessagesContext>
  );
}

export function useMessages(): QueryGridMessages {
  return use(MessagesContext).messages;
}

export function useLocale(): string {
  return use(MessagesContext).locale;
}

export function formatReservedValue(
  messages: QueryGridMessages,
  reserved: ReservedValue,
): string {
  return reserved === "empty" ? messages.emptyValue : messages.notEmptyValue;
}

export function countParams(count: number, locale: string): CountParams {
  return { count, formatted: formatCount(count, locale), locale };
}

export function formatRows(
  messages: QueryGridMessages,
  count: number,
  locale: string,
): string {
  return messages.rows(countParams(count, locale));
}

export function formatLoaded(
  messages: QueryGridMessages,
  rows: number,
  pages: number | undefined,
  locale: string,
): string {
  const text = formatRows(messages, rows, locale);
  if (pages === undefined) {
    return messages.loaded({ rows: text });
  }
  return messages.loadedInPages({ rows: text, pages, locale });
}

function formatParams(params: ProblemParams, locale: string): MessageParams {
  return Object.fromEntries(
    Object.entries(params).map(([name, value]) => [
      name,
      typeof value === "number" ? formatCount(value, locale) : value,
    ]),
  );
}

export function formatProblemMessage(
  messages: QueryGridMessages,
  problem: Problem,
  locale: string,
): string {
  const render = messages.errors[problem.code];
  return render
    ? render(formatParams(problem.params, locale))
    : messages.errorFallback({ code: problem.code });
}
