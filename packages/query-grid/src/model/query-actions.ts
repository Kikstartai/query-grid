import {
  getField,
  isDefaultSort,
  type BaseGridDef,
  type OfferContext,
  type QueryState,
  type RangeState,
  type SortDirection,
} from "./field-types.ts";
import { canExpandEquals, toExcludeValues } from "./field-values.ts";

export type QueryAction =
  | { type: "setEquals"; field: string; values: string[] }
  | { type: "removeEqualsValue"; field: string; value: string }
  | { type: "clearEquals"; field: string }
  | {
      type: "setRange";
      field?: string;
      min: string | null;
      max: string | null;
      preset?: string;
    }
  | { type: "clearRange"; field?: string }
  | { type: "setSort"; field: string; direction: SortDirection }
  | { type: "setSearch"; value: string }
  | { type: "clearSearch" }
  | { type: "reset" };

export interface Offers {
  equals: string[];
  multi: string[];
  exclude: string[];
  sorts: string[];
  ranges: string[];
  search: boolean;
}

export type OfferTarget =
  | { kind: "equals"; field: string }
  | { kind: "range"; field: string }
  | { kind: "sort"; field: string }
  | { kind: "search" };

export type ReasonCode =
  | "search_alone"
  | "search_unordered"
  | "search_no_combine"
  | "no_sort_index"
  | "range_needs_sort"
  | "no_sort_with"
  | "no_filter_with"
  | "no_range_with";

export interface UnavailableReason {
  code: ReasonCode;
  field: string | null;
  filters: string[];
  ranges: string[];
  sort: string;
}

const PROBE = ["x", "y"];

export function defaultQuery(def: BaseGridDef): QueryState {
  return {
    equals: {},
    ranges: [],
    search: null,
    sort: def.defaultSort,
    cursor: null,
  };
}

export function withoutKey(
  record: Record<string, string[]>,
  key: string,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(record).filter(([name]) => name !== key),
  );
}

function proposeClear(
  def: BaseGridDef,
  query: QueryState,
  field: string,
): QueryState[] {
  const equals = withoutKey(query.equals, field);
  return [
    { ...query, cursor: null, equals },
    {
      ...query,
      cursor: null,
      equals,
      ranges: [],
      sort: def.defaultSort,
    },
    defaultQuery(def),
  ];
}

function proposeEquals(
  def: BaseGridDef,
  query: QueryState,
  field: string,
  values: string[],
): QueryState[] {
  const unique = [...new Set(values)];
  if (unique.length === 0) {
    return proposeClear(def, query, field);
  }
  const target = getField(def, field);
  if (target && !canExpandEquals(target, unique)) {
    return [];
  }
  return [
    { ...query, cursor: null, equals: { ...query.equals, [field]: unique } },
  ];
}

interface RangeInput {
  min: string | null;
  max: string | null;
  preset?: string;
}

function toRange(field: string, { min, max, preset }: RangeInput): RangeState {
  return preset === undefined
    ? { field, min, max }
    : { field, min: null, max: null, preset };
}

function proposeAction(
  def: BaseGridDef,
  query: QueryState,
  action: QueryAction,
  context: OfferContext,
): QueryState[] {
  const top = { ...query, cursor: null };
  const searchIsOrdered = context.runnable.searchIsOrdered;
  switch (action.type) {
    case "setEquals":
      return proposeEquals(def, query, action.field, action.values);
    case "removeEqualsValue":
      return proposeEquals(
        def,
        query,
        action.field,
        (query.equals[action.field] ?? []).filter(
          (value) => value !== action.value,
        ),
      );
    case "clearEquals":
      return proposeClear(def, query, action.field);
    case "setRange": {
      const range = toRange(action.field ?? query.sort.field, action);
      const others = query.ranges.filter((item) => item.field !== range.field);
      return [
        { ...top, ranges: [...others, range] },
        { ...top, ranges: [range] },
      ];
    }
    case "clearRange":
      return [
        {
          ...top,
          ranges: query.ranges.filter(
            (range) =>
              action.field !== undefined && range.field !== action.field,
          ),
        },
      ];
    case "setSort": {
      const unordered =
        !searchIsOrdered &&
        query.search !== null &&
        !context.allSearchMatchesLoaded;
      if (unordered && !isDefaultSort(def, action)) {
        return [];
      }
      return [
        { ...top, sort: { field: action.field, direction: action.direction } },
      ];
    }
    case "setSearch":
      if (searchIsOrdered) {
        return [{ ...top, search: action.value }];
      }
      return [{ ...top, search: action.value, sort: def.defaultSort }];
    case "clearSearch":
      return [{ ...top, search: null }, defaultQuery(def)];
    case "reset":
      return [defaultQuery(def)];
  }
}

export function applyAction(
  def: BaseGridDef,
  query: QueryState,
  action: QueryAction,
  context: OfferContext,
): QueryState {
  const next = proposeAction(def, query, action, context).find((candidate) =>
    context.runnable.canRun(candidate),
  );
  return next ?? query;
}

function isOffered(
  def: BaseGridDef,
  query: QueryState,
  action: QueryAction,
  context: OfferContext,
): boolean {
  const [first] = proposeAction(def, query, action, context);
  return first !== undefined && context.runnable.canRun(first);
}

export function listOffers(
  def: BaseGridDef,
  query: QueryState,
  context: OfferContext,
): Offers {
  const offersEquals = (values: string[]) =>
    context.runnable.equalsFields.filter((field) =>
      isOffered(def, query, { type: "setEquals", field, values }, context),
    );
  return {
    equals: offersEquals(PROBE.slice(0, 1)),
    multi: offersEquals(PROBE),
    exclude: context.runnable.equalsFields.filter((field) => {
      const [first] = getField(def, field)?.options ?? [];
      return (
        first !== undefined &&
        isOffered(
          def,
          query,
          { type: "setEquals", field, values: toExcludeValues([first.value]) },
          context,
        )
      );
    }),
    sorts: context.runnable.sortFields.filter((field) =>
      isOffered(
        def,
        query,
        { type: "setSort", field, direction: "asc" },
        context,
      ),
    ),
    ranges: context.runnable.rangeFields.filter((field) =>
      isOffered(
        def,
        query,
        { type: "setRange", field, min: "x", max: null },
        context,
      ),
    ),
    search: isOffered(def, query, { type: "setSearch", value: "xxx" }, context),
  };
}

function describeQuery(
  query: QueryState,
  code: ReasonCode,
  field: string | null,
): UnavailableReason {
  return {
    code,
    field,
    filters: Object.keys(query.equals).filter((key) => key !== field),
    ranges: query.ranges
      .map((range) => range.field)
      .filter((key) => key !== field),
    sort: query.sort.field,
  };
}

export function explainUnavailable(
  query: QueryState,
  target: OfferTarget,
  context: OfferContext,
): UnavailableReason {
  if (target.kind === "search") {
    return describeQuery(query, "search_alone", null);
  }
  if (query.search !== null && target.kind === "sort") {
    return describeQuery(
      query,
      context.allSearchMatchesLoaded ? "no_sort_index" : "search_unordered",
      target.field,
    );
  }
  if (query.search !== null) {
    return describeQuery(query, "search_no_combine", target.field);
  }
  if (target.kind === "range" && query.sort.field !== target.field) {
    return describeQuery(query, "range_needs_sort", target.field);
  }
  if (target.kind === "sort") {
    return {
      ...describeQuery(query, "no_sort_with", null),
      field: target.field,
    };
  }
  return describeQuery(
    query,
    target.kind === "range" ? "no_range_with" : "no_filter_with",
    target.field,
  );
}

function stateKey(query: QueryState): string {
  return [
    Object.entries(query.equals)
      .map(([key, values]) => (values.length > 1 ? `${key}*` : key))
      .sort()
      .join("+"),
    query.ranges
      .map((range) => `range:${range.field}`)
      .sort()
      .join("+"),
    query.search !== null ? "search" : "",
    query.sort.field,
  ].join("|");
}

export function listControlActions(
  def: BaseGridDef,
  query: QueryState,
  context: OfferContext,
): QueryAction[] {
  const offers = listOffers(def, query, context);
  const actions: QueryAction[] = [{ type: "reset" }];
  for (const field of offers.equals) {
    actions.push({ type: "setEquals", field, values: PROBE.slice(0, 1) });
  }
  for (const field of offers.multi) {
    actions.push({ type: "setEquals", field, values: PROBE });
  }
  for (const field of Object.keys(query.equals)) {
    actions.push({ type: "clearEquals", field });
    actions.push({ type: "removeEqualsValue", field, value: PROBE[1] });
  }
  for (const field of offers.sorts) {
    actions.push({ type: "setSort", field, direction: "asc" });
    actions.push({ type: "setSort", field, direction: "desc" });
  }
  for (const field of offers.ranges) {
    actions.push({ type: "setRange", field, min: "x", max: null });
  }
  for (const range of query.ranges) {
    actions.push({ type: "clearRange", field: range.field });
  }
  if (offers.search) {
    actions.push({ type: "setSearch", value: "xxx" });
  }
  if (query.search !== null) {
    actions.push({ type: "clearSearch" });
  }
  return actions;
}

export function enumerateReachableStates(
  def: BaseGridDef,
  context: OfferContext,
): QueryState[] {
  const start = defaultQuery(def);
  const seen = new Map<string, QueryState>([[stateKey(start), start]]);
  const queue = [start];
  while (queue.length > 0) {
    const query = queue.shift() as QueryState;
    for (const action of listControlActions(def, query, context)) {
      const next = applyAction(def, query, action, context);
      const key = stateKey(next);
      if (!seen.has(key)) {
        seen.set(key, next);
        queue.push(next);
      }
    }
  }
  return [...seen.values()];
}
