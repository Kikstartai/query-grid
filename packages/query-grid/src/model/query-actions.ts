import {
  getField,
  INDEXED_RULES,
  type GridDef,
  type QueryRules,
  type QueryState,
  type SortDirection,
} from "./field-types.ts";
import { isAnswerable, listSortFields } from "./shapes.ts";

export type QueryAction =
  | { type: "setEquals"; field: string; value: string }
  | { type: "clearEquals"; field: string }
  | { type: "setRange"; field?: string; min: string | null; max: string | null }
  | { type: "clearRange" }
  | { type: "setSort"; field: string; direction: SortDirection }
  | { type: "setQuick"; value: string }
  | { type: "clearQuick" }
  | { type: "reset" };

export interface Offers {
  equals: string[];
  sorts: string[];
  ranges: string[];
  quick: boolean;
}

export type OfferTarget =
  | { kind: "equals"; field: string }
  | { kind: "range"; field: string }
  | { kind: "sort"; field: string }
  | { kind: "quick" };

export function defaultQuery(def: GridDef): QueryState {
  return {
    equals: {},
    range: null,
    quick: null,
    sort: def.defaultSort,
    cursor: null,
  };
}

function withoutKey(
  record: Record<string, string>,
  key: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).filter(([name]) => name !== key),
  );
}

function proposeAction(
  def: GridDef,
  query: QueryState,
  action: QueryAction,
  rules: QueryRules,
): QueryState[] {
  const top = { ...query, cursor: null };
  switch (action.type) {
    case "setEquals":
      return [
        { ...top, equals: { ...query.equals, [action.field]: action.value } },
      ];
    case "clearEquals": {
      const equals = withoutKey(query.equals, action.field);
      return [
        { ...top, equals },
        { ...top, equals, range: null, sort: def.defaultSort },
        defaultQuery(def),
      ];
    }
    case "setRange":
      return [
        {
          ...top,
          range: {
            field: action.field ?? query.sort.field,
            min: action.min,
            max: action.max,
          },
        },
      ];
    case "clearRange":
      return [{ ...top, range: null }];
    case "setSort": {
      const unordered =
        rules.mode === "indexed" &&
        query.quick !== null &&
        !rules.quickComplete;
      if (unordered) {
        return [];
      }
      return [
        { ...top, sort: { field: action.field, direction: action.direction } },
      ];
    }
    case "setQuick":
      if (rules.mode === "memory") {
        return [{ ...top, quick: action.value }];
      }
      return [{ ...top, quick: action.value, sort: def.defaultSort }];
    case "clearQuick":
      return [{ ...top, quick: null }, defaultQuery(def)];
    case "reset":
      return [defaultQuery(def)];
  }
}

export function applyAction(
  def: GridDef,
  query: QueryState,
  action: QueryAction,
  rules: QueryRules = INDEXED_RULES,
): QueryState {
  const next = proposeAction(def, query, action, rules).find((candidate) =>
    isAnswerable(def, candidate, rules.mode),
  );
  return next ?? query;
}

function isOffered(
  def: GridDef,
  query: QueryState,
  action: QueryAction,
  rules: QueryRules,
): boolean {
  const [first] = proposeAction(def, query, action, rules);
  return first !== undefined && isAnswerable(def, first, rules.mode);
}

export function listOffers(
  def: GridDef,
  query: QueryState,
  rules: QueryRules = INDEXED_RULES,
): Offers {
  return {
    equals: def.fields
      .filter((field) => field.operators.includes("eq"))
      .filter((field) =>
        isOffered(
          def,
          query,
          { type: "setEquals", field: field.key, value: "x" },
          rules,
        ),
      )
      .map((field) => field.key),
    sorts: listSortFields(def, rules.mode).filter((field) =>
      isOffered(def, query, { type: "setSort", field, direction: "asc" }, rules),
    ),
    ranges: def.fields
      .filter((field) => field.operators.includes("range"))
      .filter((field) =>
        isOffered(
          def,
          query,
          { type: "setRange", field: field.key, min: "x", max: null },
          rules,
        ),
      )
      .map((field) => field.key),
    quick: isOffered(def, query, { type: "setQuick", value: "xxx" }, rules),
  };
}

function labelOf(def: GridDef, key: string): string {
  return getField(def, key)?.label ?? key;
}

function describeQuery(def: GridDef, query: QueryState, skip: string): string {
  const filters = Object.keys(query.equals)
    .filter((key) => key !== skip)
    .map((key) => `the ${labelOf(def, key)} filter`);
  const range =
    query.range && query.range.field !== skip
      ? [`the ${labelOf(def, query.range.field)} range`]
      : [];
  return [...filters, ...range, `sort ${labelOf(def, query.sort.field)}`].join(
    " and ",
  );
}

export function explainUnavailable(
  def: GridDef,
  query: QueryState,
  target: OfferTarget,
  rules: QueryRules = INDEXED_RULES,
): string {
  if (target.kind === "quick") {
    return "The quick filter runs alone: clear the other filters first.";
  }
  const label = labelOf(def, target.field);
  if (query.quick !== null && target.kind === "sort") {
    return rules.quickComplete
      ? `No index sorts by ${label}.`
      : "A quick filter result is unordered until every match is loaded: narrow it under the cap to sort.";
  }
  if (query.quick !== null) {
    return "No index combines the quick filter with another filter.";
  }
  if (target.kind === "range" && query.sort.field !== target.field) {
    return `No index answers a ${label} range unless the sort is ${label}.`;
  }
  if (target.kind === "sort") {
    return `No index sorts by ${label} with ${describeQuery(def, query, "")}.`;
  }
  const what = target.kind === "range" ? `a ${label} range` : label;
  return `No index answers ${what} with ${describeQuery(def, query, target.field)}.`;
}

function stateKey(query: QueryState): string {
  return [
    Object.keys(query.equals).sort().join("+"),
    query.range ? `range:${query.range.field}` : "",
    query.quick !== null ? "quick" : "",
    query.sort.field,
  ].join("|");
}

export function listControlActions(
  def: GridDef,
  query: QueryState,
  rules: QueryRules = INDEXED_RULES,
): QueryAction[] {
  const offers = listOffers(def, query, rules);
  const actions: QueryAction[] = [{ type: "reset" }];
  for (const field of offers.equals) {
    actions.push({ type: "setEquals", field, value: "x" });
  }
  for (const field of Object.keys(query.equals)) {
    actions.push({ type: "clearEquals", field });
  }
  for (const field of offers.sorts) {
    actions.push({ type: "setSort", field, direction: "asc" });
    actions.push({ type: "setSort", field, direction: "desc" });
  }
  for (const field of offers.ranges) {
    actions.push({ type: "setRange", field, min: "x", max: null });
  }
  if (query.range) {
    actions.push({ type: "clearRange" });
  }
  if (offers.quick) {
    actions.push({ type: "setQuick", value: "xxx" });
  }
  if (query.quick !== null) {
    actions.push({ type: "clearQuick" });
  }
  return actions;
}

export function enumerateReachableStates(
  def: GridDef,
  rules: QueryRules = INDEXED_RULES,
): QueryState[] {
  const start = defaultQuery(def);
  const seen = new Map<string, QueryState>([[stateKey(start), start]]);
  const queue = [start];
  while (queue.length > 0) {
    const query = queue.shift() as QueryState;
    for (const action of listControlActions(def, query, rules)) {
      const next = applyAction(def, query, action, rules);
      const key = stateKey(next);
      if (!seen.has(key)) {
        seen.set(key, next);
        queue.push(next);
      }
    }
  }
  return [...seen.values()];
}
