"use client";

import { createContext, use, type ReactNode } from "react";

import {
  DEFAULT_LOCALE,
  formatCount,
  formatValue,
  resolveFieldKind,
  type BaseFieldDef,
  type DatePreset,
  type FieldKind,
  type FilterOp,
  type GridValue,
  type Problem,
  type ProblemParams,
  type ReasonCode,
  type ReorderCode,
} from "@kikstart/query-grid";

export { formatList } from "@kikstart/query-grid";

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
  rows: string;
  narrowBy: string;
}

type MessageParams = Record<string, string | number>;

export type OpLabels = Record<FieldKind, Partial<Record<FilterOp, string>>>;

export interface ChipParams {
  label: string;
  op: string;
}

export interface ChipValueParams extends ChipParams {
  value: string;
}

export interface ChipPairParams extends ChipParams {
  min: string;
  max: string;
}

export interface QueryGridMessages {
  loading: string;
  noRows: string;
  rows: (params: CountParams) => string;
  rowsCapped: (params: CountParams) => string;
  loaded: (params: { rows: string }) => string;
  loadedInPages: (params: { rows: string; pages: CountParams }) => string;
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
  thenBy: string;
  thenByDirection: (params: { label: string; direction: string }) => string;
  sortPosition: (params: { label: string; position: number }) => string;
  chipSortThen: (params: { label: string; direction: string }) => string;
  searchFilter: string;
  searchPlaceholder: (params: { fields: string }) => string;
  searchHint: (params: { min: number; max: number }) => string;
  clearSearchFilter: string;
  activeFilters: string;
  removeChip: (params: LabelParams) => string;
  chipList: (params: ChipParams) => string;
  chipNone: (params: ChipParams) => string;
  chipOne: (params: ChipValueParams) => string;
  chipPair: (params: ChipPairParams) => string;
  chipText: (params: { value: string }) => string;
  chipSearch: (params: { value: string }) => string;
  chipMatchAny: string;
  chipSort: (params: { label: string; direction: string }) => string;
  openBound: string;
  any: string;
  blankValue: string;
  ops: OpLabels;
  opField: (params: LabelParams) => string;
  datePresets: Record<DatePreset, string>;
  presetField: (params: LabelParams) => string;
  rangeValue: (params: LabelParams) => string;
  pickDate: (params: LabelParams) => string;
  value: string;
  booleanTrue: string;
  booleanFalse: string;
  textValue: (params: { label: string; op: string }) => string;
  textPlaceholder: string;
  textHint: (params: { min: number }) => string;
  matchMode: string;
  matchAll: string;
  matchAny: string;
  group: string;
  groupBy: string;
  groupToggle: (params: LabelParams) => string;
  groupLoadMore: string;
  chipGroup: (params: LabelParams) => string;
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
  selectedRows: (params: CountParams) => string;
  selectAllMatching: (params: { rows: string }) => string;
  allMatchingSelected: (params: { rows: string }) => string;
  clearSelection: string;
  rowActions: (params: LabelParams) => string;
  rowActionsColumn: string;
  reorderRow: (params: LabelParams) => string;
  reorderColumn: string;
  reorderHelp: string;
  reorderFailed: (params: { reason: string }) => string;
  reorderSteps: Record<
    "grab" | "move" | "drop" | "cancel",
    (params: { label: string; position: number; total: number }) => string
  >;
  reorderReasons: Record<ReorderCode, (params: LabelParams) => string>;
  moreItems: (params: { count: number }) => string;
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
  exportCsv: string;
  exporting: string;
  exportOverLimit: (params: { limit: string; rows: string }) => string;
  boardHelp: string;
  boardUnavailable: string;
  moveFailed: string;
  reasons: Record<ReasonCode, (params: ReasonParams) => string>;
  reasonParts: Record<"filter" | "range" | "sort", (label: string) => string>;
  errors: Record<string, (params: MessageParams) => string>;
  errorFallback: (params: { code: string }) => string;
}

type NestedKey =
  | "reorderSteps"
  | "reorderReasons"
  | "countSources"
  | "facetNotes"
  | "datePresets"
  | "reasons"
  | "reasonParts";

export type QueryGridMessageOverrides = Partial<
  Omit<QueryGridMessages, NestedKey | "errors" | "ops">
> & {
  [K in NestedKey]?: Partial<QueryGridMessages[K]>;
} & {
  errors?: QueryGridMessages["errors"];
  ops?: Partial<OpLabels>;
};

const pluralRules = new Map<string, Intl.PluralRules>();

export function selectPlural(
  locale: string,
  count: number,
  forms: PluralForms,
): string {
  const rules = pluralRules.get(locale) ?? new Intl.PluralRules(locale);
  pluralRules.set(locale, rules);
  return forms[rules.select(count)] ?? forms.other;
}

export const DEFAULT_MESSAGES: QueryGridMessages = {
  loading: "Loading…",
  noRows: "No rows match.",
  rows: ({ count, formatted, locale }) =>
    `${formatted} ${selectPlural(locale, count, { one: "row", other: "rows" })}`,
  rowsCapped: ({ formatted }) => `${formatted}+ rows`,
  loaded: ({ rows }) => `${rows} loaded`,
  loadedInPages: ({ rows, pages }) =>
    `${rows} loaded in ${pages.formatted} keyset ${selectPlural(pages.locale, pages.count, { one: "page", other: "pages" })}`,
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
  thenBy: "Then by",
  thenByDirection: ({ label, direction }) => `${label}: ${direction}`,
  sortPosition: ({ label, position }) =>
    `Sort by ${label}, sort column ${position}`,
  chipSortThen: ({ label, direction }) => `, then ${label} ${direction}`,
  searchFilter: "Search",
  searchPlaceholder: ({ fields }) => `Search: ${fields}`,
  searchHint: ({ min, max }) => `${min} to ${max} characters`,
  clearSearchFilter: "Clear search",
  activeFilters: "Active filters and sort",
  removeChip: ({ label }) => `Remove ${label}`,
  chipList: ({ label, op }) => `${label} ${op}:`,
  chipNone: ({ label, op }) => `${label} ${op}`,
  chipOne: ({ label, op, value }) => `${label} ${op} ${value}`,
  chipPair: ({ label, op, min, max }) => `${label} ${op} ${min} and ${max}`,
  chipText: ({ value }) => `“${value}”`,
  chipSearch: ({ value }) => `Search: “${value}”`,
  chipMatchAny: "Match any",
  chipSort: ({ label, direction }) => `Sort: ${label} ${direction}`,
  openBound: "…",
  any: "any",
  blankValue: "(blank)",
  ops: {
    text: {
      equals: "equals",
      not_equals: "not equals",
      contains: "contains",
      not_contains: "not contains",
      starts_with: "starts with",
      ends_with: "ends with",
      blank: "blank",
      not_blank: "not blank",
    },
    number: {
      equals: "equals",
      not_equals: "not equals",
      greater_than: "greater than",
      greater_or_equal: "greater or equal",
      less_than: "less than",
      less_or_equal: "less or equal",
      between: "between",
      not_between: "not between",
      blank: "blank",
      not_blank: "not blank",
    },
    date: {
      equals: "on",
      not_equals: "not on",
      greater_than: "after",
      greater_or_equal: "on or after",
      less_than: "before",
      less_or_equal: "on or before",
      between: "between",
      not_between: "not between",
      in_period: "in period",
      blank: "blank",
      not_blank: "not blank",
    },
    choice: {
      any_of: "any of",
      none_of: "none of",
      blank: "blank",
      not_blank: "not blank",
    },
    array: {
      any_of: "any of",
      none_of: "none of",
      all_of: "all of",
      blank: "blank",
    },
  },
  opField: ({ label }) => `${label} operator`,
  datePresets: {
    today: "Today",
    yesterday: "Yesterday",
    "last-7-days": "Last 7 days",
    "last-30-days": "Last 30 days",
    "this-month": "This month",
    "last-month": "Last month",
    "this-year": "This year",
  },
  presetField: ({ label }) => `${label} period`,
  rangeValue: ({ label }) => `${label} value`,
  pickDate: ({ label }) => `Pick a ${label} date`,
  value: "value",
  booleanTrue: "Yes",
  booleanFalse: "No",
  textHint: ({ min }) => `${min} characters or more`,
  textValue: ({ label, op }) => `${label} ${op}`,
  textPlaceholder: "text…",
  matchMode: "Match",
  matchAll: "Match all",
  matchAny: "Match any",
  group: "Group",
  groupBy: "Group by",
  groupToggle: ({ label }) => `${label} group`,
  groupLoadMore: "Load more",
  chipGroup: ({ label }) => `Group: ${label}`,
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
  selectedRows: ({ formatted }) => `${formatted} selected`,
  selectAllMatching: ({ rows }) => `Select all ${rows} that match`,
  allMatchingSelected: ({ rows }) => `All ${rows} that match are selected.`,
  clearSelection: "Clear selection",
  rowActions: ({ label }) => `Actions for ${label}`,
  rowActionsColumn: "Actions",
  reorderRow: ({ label }) => `Reorder ${label}`,
  reorderColumn: "Order",
  reorderHelp:
    "Drag a row by its handle, or press Space on the handle and use the arrow keys, to move it. Space drops it and Escape puts it back.",
  reorderFailed: ({ reason }) => `The new order was not saved: ${reason}`,
  reorderSteps: {
    grab: ({ label, position, total }) =>
      `${label} picked up, position ${position} of ${total}.`,
    move: ({ label, position, total }) =>
      `${label}, position ${position} of ${total}.`,
    drop: ({ label, position, total }) =>
      `${label} dropped at position ${position} of ${total}.`,
    cancel: ({ label }) => `${label} put back.`,
  },
  reorderReasons: {
    reorder_needs_order: ({ label }) =>
      `Sort by ${label} ascending, and by nothing else, to reorder.`,
    reorder_needs_all_rows: () =>
      "Reordering needs every row loaded: narrow the filters first.",
    reorder_grouped: () => "Clear the grouping to reorder.",
  },
  moreItems: ({ count }) => `+${count}`,
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
  exportCsv: "Export CSV",
  exporting: "Exporting…",
  exportOverLimit: ({ limit, rows }) =>
    `An export takes at most ${limit}: ${rows} match. Narrow the filters first.`,
  boardHelp:
    "Drag a card, or press Space on it and use the arrow keys, to change its status. A column the card may not move to is skipped, and a drop outside the column it is shown in puts it back.",
  boardUnavailable:
    "No index answers the board with these filters. Clear the filters the board cannot combine with a status.",
  moveFailed: "The move failed",
  reasons: {
    search_alone: () =>
      "The search combines with equality filters only: clear the other filters and Match any first.",
    search_unordered: () =>
      "A search result is unordered until every match is loaded: narrow it under the cap to sort.",
    search_no_combine: () => "The search combines with equality filters only.",
    no_sort_index: ({ label }) => `No index sorts by ${label}.`,
    range_needs_sort: ({ label }) =>
      `No index answers a ${label} range unless the sort is ${label}.`,
    no_sort_with: ({ label, blockers }) =>
      `No index sorts by ${label} with ${blockers}.`,
    no_filter_with: ({ label, blockers }) =>
      `No index answers ${label} with ${blockers}.`,
    no_range_with: ({ label, blockers }) =>
      `No index answers a ${label} range with ${blockers}.`,
    narrow_first: ({ rows, narrowBy }) =>
      narrowBy
        ? `Narrow by ${narrowBy} first: ${rows}.`
        : `Narrow the filters first: ${rows}.`,
    narrow_counting: () => "Counting the rows these filters leave…",
    no_combine_or: ({ blockers }) =>
      `No index answers Match any with ${blockers}.`,
    no_group_with: ({ label, blockers }) =>
      `No index reads the rows of one ${label} group with ${blockers}.`,
    sort_limit: () => "A sort takes no more columns.",
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
    too_many_sorts: ({ max }) => `A sort takes at most ${max} columns.`,
    invalid_cursor: () => "The cursor does not decode.",
    invalid_limit: () => "The page size is not a number.",
    too_many_filters: ({ max }) => `At most ${max} filters at once.`,
    invalid_op: ({ field, op }) => `${field} cannot be filtered by ${op}.`,
    literal_required: ({ field, op }) =>
      `${field} ${op} is resolved in the browser before it is sent.`,
    too_broad: () =>
      "That matches too much to answer fast. Add more characters or another filter.",
    narrow_first: ({ limit }) =>
      `These filters leave more than ${limit} rows. Narrow them first, or clear the filters no index answers, or Match any.`,
    export_too_large: ({ limit }) =>
      `More than ${limit} rows match. Narrow the filters to export them.`,
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

function mergeOps(base: OpLabels, overrides: Partial<OpLabels>): OpLabels {
  return {
    text: { ...base.text, ...overrides.text },
    number: { ...base.number, ...overrides.number },
    date: { ...base.date, ...overrides.date },
    choice: { ...base.choice, ...overrides.choice },
    array: { ...base.array, ...overrides.array },
  };
}

function mergeMessages(
  base: QueryGridMessages,
  overrides: QueryGridMessageOverrides,
): QueryGridMessages {
  return {
    ...base,
    ...overrides,
    reorderSteps: { ...base.reorderSteps, ...overrides.reorderSteps },
    reorderReasons: { ...base.reorderReasons, ...overrides.reorderReasons },
    countSources: { ...base.countSources, ...overrides.countSources },
    facetNotes: { ...base.facetNotes, ...overrides.facetNotes },
    datePresets: { ...base.datePresets, ...overrides.datePresets },
    ops: mergeOps(base.ops, overrides.ops ?? {}),
    reasons: { ...base.reasons, ...overrides.reasons },
    reasonParts: { ...base.reasonParts, ...overrides.reasonParts },
    errors: { ...base.errors, ...overrides.errors },
  };
}

interface MessagesContextValue {
  messages: QueryGridMessages;
  locale: string;
  currency: string | undefined;
}

const MessagesContext = createContext<MessagesContextValue>({
  messages: DEFAULT_MESSAGES,
  locale: DEFAULT_LOCALE,
  currency: undefined,
});

export interface QueryGridMessagesProviderProps {
  messages?: QueryGridMessageOverrides;
  locale?: string;
  currency?: string;
  children: ReactNode;
}

export function QueryGridMessagesProvider({
  messages = {},
  locale,
  currency,
  children,
}: QueryGridMessagesProviderProps) {
  const outer = use(MessagesContext);
  return (
    <MessagesContext
      value={{
        messages: mergeMessages(outer.messages, messages),
        locale: locale ?? outer.locale,
        currency: currency ?? outer.currency,
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

export function useCurrency(): string | undefined {
  return use(MessagesContext).currency;
}

export function formatOpLabel(
  messages: QueryGridMessages,
  field: BaseFieldDef,
  op: FilterOp,
): string {
  return messages.ops[resolveFieldKind(field)][op] ?? op;
}

export function formatBoolean(
  messages: QueryGridMessages,
  value: GridValue,
): string {
  return value === true || value === "true"
    ? messages.booleanTrue
    : messages.booleanFalse;
}

export function formatCell(
  messages: QueryGridMessages,
  field: BaseFieldDef,
  value: GridValue,
  locale: string,
  currency?: string,
): string {
  if (field.type === "boolean" && value !== null) {
    return formatBoolean(messages, value);
  }
  return formatValue(field, value, locale, currency);
}

export function countParams(count: number, locale: string): CountParams {
  return { count, formatted: formatCount(count, locale), locale };
}

export function formatRows(
  messages: QueryGridMessages,
  count: number,
  locale: string,
  capped = false,
): string {
  const params = countParams(count, locale);
  return capped ? messages.rowsCapped(params) : messages.rows(params);
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
  return messages.loadedInPages({
    rows: text,
    pages: countParams(pages, locale),
  });
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
