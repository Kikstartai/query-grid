import {
  getField,
  isDefaultSort,
  resolveMaxValues,
  type BaseFieldDef,
  type BaseGridDef,
  type SortDirection,
} from "./grid-def.ts";
import {
  listFieldFilters,
  listSorts,
  listThenBy,
  SORT_MAX,
  withThenBy,
  type Combinator,
  type Filter,
  type QueryState,
} from "./query-state.ts";
import { listCapableOps, type OfferContext } from "./capabilities.ts";
import { canExpandNoneOf } from "./filter-values.ts";
import { TEXT_INDEX_MIN_LENGTH } from "./indexes.ts";
import {
  getOperatorShape,
  isLiteralOp,
  OPERATORS,
  listFixedValues,
  resolveFieldKind,
  TEXT_MATCH_OPS,
  type FilterOp,
} from "./operators.ts";

export type QueryAction =
  | { type: "setFilter"; filter: Filter; at?: number }
  | { type: "removeFilter"; field: string; at?: number }
  | {
      type: "removeFilterValue";
      field: string;
      at: number;
      value: string | null;
    }
  | { type: "setCombine"; combine: Combinator }
  | { type: "setGroup"; field: string | null }
  | { type: "setSort"; field: string; direction: SortDirection }
  | { type: "addSort"; field: string; direction: SortDirection }
  | { type: "removeSort"; field: string }
  | { type: "setSearch"; value: string }
  | { type: "clearSearch" }
  | { type: "reset" };

export type ReasonCode =
  | "search_alone"
  | "search_unordered"
  | "search_no_combine"
  | "no_sort_index"
  | "range_needs_sort"
  | "no_sort_with"
  | "no_filter_with"
  | "no_range_with"
  | "narrow_first"
  | "narrow_counting"
  | "no_group_with"
  | "no_combine_or"
  | "sort_limit";

export interface UnavailableReason {
  code: ReasonCode;
  field: string | null;
  filters: string[];
  ranges: string[];
  sort: string;
  rows: number | null;
  capped: boolean;
  narrowBy: string[];
}

export interface OpOffer {
  op: FilterOp;
  offered: boolean;
  reason: UnavailableReason | null;
  minLength?: number;
}

export interface Offers {
  filters: Record<string, OpOffer[]>;
  sorts: string[];
  thenBy: string[];
  combineOr: boolean;
  groups: string[];
  search: boolean;
}

export type OfferTarget =
  | { kind: "filter"; field: string; op: FilterOp }
  | { kind: "sort"; field: string }
  | { kind: "thenBy"; field: string }
  | { kind: "combine" }
  | { kind: "group"; field: string }
  | { kind: "search" };

const PROBE = ["x", "y"];

export function defaultQuery(def: BaseGridDef): QueryState {
  return {
    filters: [],
    combine: "and",
    search: null,
    sort: def.defaultSort,
    group: null,
    cursor: null,
  };
}

// A probe stands for any value the control could send: a text one long enough for a text index, a list one the fixed values keep a remainder of.
export function createProbeFilter(
  field: BaseFieldDef,
  op: FilterOp,
  short = false,
): Filter {
  const { key } = field;
  switch (getOperatorShape(op)) {
    case "one": {
      const text = resolveFieldKind(field) === "text" && !short;
      return {
        field: key,
        op,
        value: text ? "x".repeat(TEXT_INDEX_MIN_LENGTH) : "x",
      } as Filter;
    }
    case "pair":
      return { field: key, op, min: "x", max: "y" } as Filter;
    case "list": {
      const [first] = listFixedValues(field) ?? PROBE;
      return { field: key, op, values: [first] } as Filter;
    }
    case "preset":
      return { field: key, op: "in_period", preset: "today" };
    case "none":
      return { field: key, op } as Filter;
  }
}

function isBoundFilter(def: BaseGridDef, filter: Filter): boolean {
  const field = getField(def, filter.field);
  const kind = field ? resolveFieldKind(field) : null;
  return (
    (kind === "number" || kind === "date") &&
    getOperatorShape(filter.op) !== "none"
  );
}

function replaceFilter(
  query: QueryState,
  filter: Filter,
  at: number,
): Filter[] {
  const target = listFieldFilters(query, filter.field)[at];
  return target
    ? query.filters.map((item) => (item === target ? filter : item))
    : [...query.filters, filter];
}

function dropFilters(
  query: QueryState,
  field: string,
  at: number | undefined,
): Filter[] {
  if (at === undefined) {
    return query.filters.filter((filter) => filter.field !== field);
  }
  const target = listFieldFilters(query, field)[at];
  return query.filters.filter((filter) => filter !== target);
}

function proposeRemove(
  def: BaseGridDef,
  query: QueryState,
  field: string,
  at: number | undefined,
): QueryState[] {
  const filters = dropFilters(query, field, at);
  return [
    { ...query, cursor: null, filters },
    {
      ...query,
      cursor: null,
      filters: filters.filter((filter) => !isBoundFilter(def, filter)),
      sort: def.defaultSort,
      thenBy: undefined,
    },
    defaultQuery(def),
  ];
}

function normalizeFilter(filter: Filter): Filter | null {
  if ("values" in filter) {
    const values = [...new Set(filter.values)];
    return values.length > 0 ? { ...filter, values } : null;
  }
  return filter;
}

function proposeSetFilter(
  def: BaseGridDef,
  query: QueryState,
  given: Filter,
  at: number,
): QueryState[] {
  const filter = normalizeFilter(given);
  if (!filter) {
    return proposeRemove(def, query, given.field, at);
  }
  const field = getField(def, filter.field);
  const target = listFieldFilters(query, filter.field)[at];
  const twin =
    "values" in filter &&
    query.filters.some(
      (item) =>
        item !== target && item.field === filter.field && item.op === filter.op,
    );
  // Two lists with one field and operator would read back from the URL as one list, an OR in place of the AND.
  if (twin) {
    return [];
  }
  if (field && "values" in filter) {
    const literal = isLiteralOp(field, filter.op);
    const fits = literal
      ? canExpandNoneOf(field, filter)
      : filter.values.length <= resolveMaxValues(field);
    if (!fits) {
      return [];
    }
  }
  const top = { ...query, cursor: null };
  const replaced = { ...top, filters: replaceFilter(query, filter, at) };
  if (!isBoundFilter(def, filter)) {
    return [replaced];
  }
  return [
    replaced,
    {
      ...top,
      filters: [
        ...query.filters.filter(
          (item) => item.field !== filter.field && !isBoundFilter(def, item),
        ),
        filter,
      ],
    },
  ];
}

function proposeRemoveValue(
  def: BaseGridDef,
  query: QueryState,
  field: string,
  at: number,
  value: string | null,
): QueryState[] {
  const target = listFieldFilters(query, field)[at];
  if (!target || !("values" in target)) {
    return [];
  }
  const values = target.values.filter((item) => item !== value);
  return proposeSetFilter(def, query, { ...target, values }, at);
}

function proposeAddSort(
  query: QueryState,
  field: string,
  direction: SortDirection,
): QueryState[] {
  const top = { ...query, cursor: null };
  const thenBy = listThenBy(query);
  if (field === query.sort.field) {
    const turned = { ...top, sort: { field, direction } };
    return [
      turned,
      withThenBy(
        turned,
        thenBy.map((sort) => ({ field: sort.field, direction })),
      ),
    ];
  }
  const known = thenBy.some((sort) => sort.field === field);
  if (!known && thenBy.length + 1 >= SORT_MAX) {
    return [];
  }
  const next = known
    ? thenBy.map((sort) => (sort.field === field ? { field, direction } : sort))
    : [...thenBy, { field, direction }];
  return [withThenBy(top, next)];
}

function proposeRemoveSort(
  def: BaseGridDef,
  query: QueryState,
  field: string,
): QueryState[] {
  const top = { ...query, cursor: null };
  const fallback = { ...top, sort: def.defaultSort, thenBy: undefined };
  const [next, ...rest] = listThenBy(query);
  if (field !== query.sort.field) {
    const kept = listThenBy(query).filter((sort) => sort.field !== field);
    return [withThenBy(top, kept), fallback];
  }
  return next
    ? [withThenBy({ ...top, sort: next }, rest), fallback]
    : [fallback];
}

function proposeAction(
  def: BaseGridDef,
  query: QueryState,
  action: QueryAction,
  context: OfferContext,
): QueryState[] {
  const top = { ...query, cursor: null };
  const searchIsOrdered = context.capabilities.searchIsOrdered;
  switch (action.type) {
    case "setFilter":
      return proposeSetFilter(def, query, action.filter, action.at ?? 0);
    case "removeFilter":
      return proposeRemove(def, query, action.field, action.at);
    case "removeFilterValue":
      return proposeRemoveValue(
        def,
        query,
        action.field,
        action.at,
        action.value,
      );
    case "setCombine":
      return [{ ...top, combine: action.combine }];
    case "setGroup":
      return [{ ...top, group: action.field }];
    case "setSort": {
      const unordered =
        !searchIsOrdered &&
        query.search !== null &&
        !context.allSearchMatchesLoaded;
      if (unordered && !isDefaultSort(def, action)) {
        return [];
      }
      const sort = { field: action.field, direction: action.direction };
      const single = { ...top, sort, thenBy: undefined };
      return [
        single,
        ...context.capabilities.sortOrders
          .filter(([first]) => first === action.field)
          .map(([, ...then]) =>
            withThenBy(
              single,
              then.map((field) => ({ field, direction: action.direction })),
            ),
          ),
      ];
    }
    case "addSort": {
      const unordered =
        !searchIsOrdered &&
        query.search !== null &&
        !context.allSearchMatchesLoaded;
      return unordered
        ? []
        : proposeAddSort(query, action.field, action.direction);
    }
    case "removeSort":
      return proposeRemoveSort(def, query, action.field);
    case "setSearch":
      if (searchIsOrdered) {
        return [{ ...top, search: action.value }];
      }
      return [
        {
          ...top,
          search: action.value,
          sort: def.defaultSort,
          thenBy: undefined,
        },
      ];
    case "clearSearch":
      return [{ ...top, search: null }, defaultQuery(def)];
    case "reset":
      return [defaultQuery(def)];
  }
}

type NarrowFit = "fits" | "over" | "unknown";

function fitNarrowLimit(
  candidate: QueryState,
  context: OfferContext,
): NarrowFit {
  const { capabilities, narrowed } = context;
  if (!capabilities.narrowLimited || !capabilities.isNarrowed(candidate)) {
    return "fits";
  }
  const basis = capabilities.narrowBasis(candidate);
  if (narrowed && basis === narrowed.andBasis) {
    return narrowed.and.over ? "over" : "fits";
  }
  if (narrowed?.or && basis === narrowed.orBasis) {
    return narrowed.or.over ? "over" : "fits";
  }
  return "unknown";
}

// A set whose size is not known yet may only be entered from a query already running over a narrowed set, where the server has the last word.
function isAnswerable(
  query: QueryState,
  candidate: QueryState,
  context: OfferContext,
): boolean {
  if (!context.capabilities.canRun(candidate)) {
    return false;
  }
  const fit = fitNarrowLimit(candidate, context);
  return (
    fit === "fits" ||
    (fit === "unknown" && context.capabilities.isNarrowed(query))
  );
}

export function applyAction(
  def: BaseGridDef,
  query: QueryState,
  action: QueryAction,
  context: OfferContext,
): QueryState {
  const next = proposeAction(def, query, action, context).find((candidate) =>
    isAnswerable(query, candidate, context),
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
  return first !== undefined && isAnswerable(query, first, context);
}

function isOpOffered(
  def: BaseGridDef,
  query: QueryState,
  field: BaseFieldDef,
  op: FilterOp,
  context: OfferContext,
  short = false,
): boolean {
  const filter = createProbeFilter(field, op, short);
  return isOffered(def, query, { type: "setFilter", filter }, context);
}

interface OpListing {
  field: BaseFieldDef;
  op: FilterOp;
  offered: boolean;
}

function listOpListings(
  def: BaseGridDef,
  query: QueryState,
  context: OfferContext,
): OpListing[] {
  return def.fields.flatMap((field) =>
    listCapableOps(context.capabilities, field.key).map((op) => ({
      field,
      op,
      offered: isOpOffered(def, query, field, op, context),
    })),
  );
}

function resolveMinLength(
  def: BaseGridDef,
  query: QueryState,
  listing: OpListing,
  context: OfferContext,
): number | undefined {
  const { field, op, offered } = listing;
  const matched = offered && TEXT_MATCH_OPS.includes(op);
  if (!matched || isOpOffered(def, query, field, op, context, true)) {
    return undefined;
  }
  return TEXT_INDEX_MIN_LENGTH;
}

function listCoreOffers(
  def: BaseGridDef,
  query: QueryState,
  context: OfferContext,
): Omit<Offers, "filters"> {
  return {
    sorts: context.capabilities.sortFields.filter((field) =>
      proposeAction(
        def,
        query,
        { type: "setSort", field, direction: "asc" },
        context,
      ).some((candidate) => isAnswerable(query, candidate, context)),
    ),
    thenBy: context.capabilities.thenByFields.filter(
      (field) =>
        !listSorts(query).some((sort) => sort.field === field) &&
        isOffered(
          def,
          query,
          { type: "addSort", field, direction: query.sort.direction },
          context,
        ),
    ),
    combineOr:
      context.capabilities.combineOr &&
      isOffered(def, query, { type: "setCombine", combine: "or" }, context),
    groups: context.capabilities.groupFields.filter((field) =>
      isOffered(def, query, { type: "setGroup", field }, context),
    ),
    search: isOffered(def, query, { type: "setSearch", value: "xxx" }, context),
  };
}

export function listOffers(
  def: BaseGridDef,
  query: QueryState,
  context: OfferContext,
): Offers {
  const filters = Object.create(null) as Record<string, OpOffer[]>;
  for (const listing of listOpListings(def, query, context)) {
    const { field, op, offered } = listing;
    const minLength = resolveMinLength(def, query, listing, context);
    const offer: OpOffer = {
      op,
      offered,
      reason: offered
        ? null
        : explainUnavailable(
            def,
            query,
            { kind: "filter", field: field.key, op },
            context,
          ),
      ...(minLength === undefined ? {} : { minLength }),
    };
    filters[field.key] = [...(filters[field.key] ?? []), offer];
  }
  return {
    filters,
    ...listCoreOffers(def, query, context),
  };
}

function isRangeOp(op: FilterOp): boolean {
  return OPERATORS[op].kinds.every(
    (kind) => kind === "number" || kind === "date",
  );
}

function describeQuery(
  query: QueryState,
  code: ReasonCode,
  field: string | null,
): UnavailableReason {
  const others = query.filters.filter((filter) => filter.field !== field);
  return {
    code,
    field,
    filters: [
      ...new Set(
        others
          .filter((filter) => !isRangeOp(filter.op))
          .map((filter) => filter.field),
      ),
    ],
    ranges: [
      ...new Set(
        others
          .filter((filter) => isRangeOp(filter.op))
          .map((filter) => filter.field),
      ),
    ],
    sort: query.sort.field,
    rows: null,
    capped: false,
    narrowBy: [],
  };
}

const NARROW_BY_MAX = 2;

function toCandidate(
  def: BaseGridDef,
  query: QueryState,
  target: OfferTarget,
): QueryState {
  switch (target.kind) {
    case "filter": {
      const field = getField(def, target.field);
      if (!field) {
        return query;
      }
      const filter = createProbeFilter(field, target.op);
      return { ...query, filters: replaceFilter(query, filter, 0) };
    }
    case "combine":
      return { ...query, combine: "or" };
    case "group":
      return { ...query, group: target.field };
    case "thenBy":
      return withThenBy(query, [
        ...listThenBy(query).filter((sort) => sort.field !== target.field),
        { field: target.field, direction: query.sort.direction },
      ]);
    default:
      return query;
  }
}

function listNarrowBy(
  def: BaseGridDef,
  query: QueryState,
  context: OfferContext,
): string[] {
  return def.fields
    .filter(
      (field) =>
        resolveFieldKind(field) === "choice" &&
        listCapableOps(context.capabilities, field.key).includes("any_of") &&
        listFieldFilters(query, field.key).length === 0,
    )
    .map((field) => field.key)
    .slice(0, NARROW_BY_MAX);
}

function explainNarrowing(
  def: BaseGridDef,
  query: QueryState,
  target: OfferTarget,
  context: OfferContext,
): UnavailableReason | null {
  const { capabilities, narrowed } = context;
  const candidate = toCandidate(def, query, target);
  if (candidate === query || !capabilities.canRun(candidate)) {
    return null;
  }
  const field = "field" in target ? target.field : null;
  const fit = fitNarrowLimit(candidate, context);
  if (fit === "fits") {
    return null;
  }
  if (fit === "unknown" || !narrowed) {
    return describeQuery(query, "narrow_counting", field);
  }
  const size = target.kind === "combine" ? narrowed.or : narrowed.and;
  return {
    ...describeQuery(query, "narrow_first", field),
    rows: size?.rows ?? narrowed.limit,
    capped: size?.capped ?? true,
    narrowBy:
      target.kind === "combine" ? [] : listNarrowBy(def, query, context),
  };
}

function explainFilter(
  def: BaseGridDef,
  query: QueryState,
  target: Extract<OfferTarget, { kind: "filter" }>,
): UnavailableReason {
  const field = getField(def, target.field);
  const compared =
    isRangeOp(target.op) ||
    (target.op === "equals" &&
      field !== null &&
      resolveFieldKind(field) !== "text");
  if (!compared) {
    return describeQuery(query, "no_filter_with", target.field);
  }
  return describeQuery(
    query,
    query.sort.field === target.field ? "no_range_with" : "range_needs_sort",
    target.field,
  );
}

export function explainUnavailable(
  def: BaseGridDef,
  query: QueryState,
  target: OfferTarget,
  context: OfferContext,
): UnavailableReason {
  if (target.kind === "search") {
    return describeQuery(query, "search_alone", null);
  }
  if (query.search !== null && target.kind === "combine") {
    return describeQuery(query, "search_no_combine", null);
  }
  const narrowing =
    query.search === null
      ? explainNarrowing(def, query, target, context)
      : null;
  if (narrowing) {
    return narrowing;
  }
  if (target.kind === "combine") {
    return describeQuery(query, "no_combine_or", null);
  }
  if (target.kind === "group") {
    return describeQuery(
      query,
      query.search === null ? "no_group_with" : "search_no_combine",
      target.field,
    );
  }
  const sorting = target.kind === "sort" || target.kind === "thenBy";
  if (query.search !== null && sorting) {
    return describeQuery(
      query,
      context.allSearchMatchesLoaded ? "no_sort_index" : "search_unordered",
      target.field,
    );
  }
  if (query.search !== null) {
    return describeQuery(query, "search_no_combine", target.field);
  }
  if (target.kind === "thenBy" && listSorts(query).length >= SORT_MAX) {
    return describeQuery(query, "sort_limit", target.field);
  }
  if (sorting) {
    return {
      ...describeQuery(query, "no_sort_with", null),
      field: target.field,
    };
  }
  return explainFilter(def, query, target);
}

function stateKey(query: QueryState): string {
  return [
    query.filters
      .map((filter) => {
        const several = "values" in filter && filter.values.length > 1;
        return `${filter.field}:${filter.op}${several ? "*" : ""}`;
      })
      .sort()
      .join("+"),
    query.combine,
    query.group ?? "",
    query.search !== null ? "search" : "",
    listSorts(query)
      .map((sort) => sort.field)
      .join(">"),
  ].join("|");
}

export function listControlActions(
  def: BaseGridDef,
  query: QueryState,
  context: OfferContext,
): QueryAction[] {
  const actions: QueryAction[] = [{ type: "reset" }];
  for (const { field, op, offered } of listOpListings(def, query, context)) {
    if (offered) {
      actions.push({ type: "setFilter", filter: createProbeFilter(field, op) });
    }
  }
  for (const filter of query.filters) {
    const at = listFieldFilters(query, filter.field).indexOf(filter);
    actions.push({ type: "removeFilter", field: filter.field, at });
    if ("values" in filter) {
      actions.push({
        type: "removeFilterValue",
        field: filter.field,
        at,
        value: PROBE[1],
      });
    }
  }
  const offers = listCoreOffers(def, query, context);
  for (const field of offers.sorts) {
    actions.push({ type: "setSort", field, direction: "asc" });
    actions.push({ type: "setSort", field, direction: "desc" });
  }
  if (offers.combineOr) {
    actions.push({ type: "setCombine", combine: "or" });
  }
  if (query.combine === "or") {
    actions.push({ type: "setCombine", combine: "and" });
  }
  for (const field of offers.groups) {
    actions.push({ type: "setGroup", field });
  }
  if (query.group !== null) {
    actions.push({ type: "setGroup", field: null });
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
