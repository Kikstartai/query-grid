"use client";

import {
  canReorder,
  explainReorder,
  explainUnavailable,
  getFieldLabel,
  listFilterChips,
  listOffers,
  type BaseGridDef,
  type CountState,
  type FacetState,
  type FeedState,
  type FilterChip,
  type GridLimits,
  type GridView,
  type OfferContext,
  type Offers,
  type OfferTarget,
  type QueryScope,
  type QueryState,
  type TotalState,
} from "@kikstart/query-grid";

import {
  layoutColumns,
  type ColumnState,
  type ColumnStore,
  type GridColumn,
} from "../components/column-state.ts";
import type { FieldDef } from "../components/fields.ts";
import type { ChipItem } from "../components/filter-bar.tsx";
import {
  formatRows,
  useCurrency,
  useLocale,
  useMessages,
} from "../components/messages.tsx";
import { useStoreValue } from "../components/use-store-value.ts";
import { formatChip, formatReason } from "./query-grid-format.ts";
import { useQueryGridMeta, useQueryGridState } from "./query-grid-context.tsx";

export interface ColumnsModel {
  state: ColumnState[];
  layout: GridColumn<FieldDef>[];
  store: ColumnStore;
}

export interface OfferState {
  offered: boolean;
  reason: string | null;
}

export interface LabelledChip {
  chip: FilterChip;
  item: ChipItem;
}

export function useQueryState(): QueryState {
  const { store } = useQueryGridState();
  return useStoreValue(store.subscribe, store.getQuery);
}

export function useGridView(): GridView {
  const { store } = useQueryGridState();
  return useStoreValue(store.subscribe, store.getView);
}

export function useOfferContext(): OfferContext {
  const { store } = useQueryGridState();
  return useStoreValue(store.subscribe, store.getOfferContext);
}

const offersByQuery = new WeakMap<QueryState, WeakMap<OfferContext, Offers>>();

function readOffers(
  def: BaseGridDef,
  query: QueryState,
  context: OfferContext,
): Offers {
  const byContext =
    offersByQuery.get(query) ?? new WeakMap<OfferContext, Offers>();
  offersByQuery.set(query, byContext);
  const offers = byContext.get(context) ?? listOffers(def, query, context);
  byContext.set(context, offers);
  return offers;
}

export function useOffers(): Offers {
  const { def } = useQueryGridMeta();
  return readOffers(def, useQueryState(), useOfferContext());
}

export function useFeedState(): FeedState {
  const { feed } = useQueryGridState();
  return useStoreValue(feed.subscribe, feed.getState);
}

export function useCountState(): CountState {
  const { counts } = useQueryGridState();
  return useStoreValue(counts.subscribe, counts.getState);
}

export function useTotalState(): TotalState {
  const { totals } = useQueryGridState();
  return useStoreValue(totals.subscribe, totals.getState);
}

export function useFacetState(): FacetState {
  const { facets } = useQueryGridState();
  return useStoreValue(facets.subscribe, facets.getState);
}

export function useFieldLabels(): Record<string, string> {
  const { labels } = useQueryGridState();
  return useStoreValue(labels.subscribe, labels.getLabels);
}

export function useGridLimits(): GridLimits | null {
  const { limits } = useQueryGridState();
  return useStoreValue(limits.subscribe, limits.getLimits);
}

function isOffered(offers: Offers, target: OfferTarget): boolean {
  switch (target.kind) {
    case "search":
      return offers.search;
    case "combine":
      return offers.combineOr;
    case "filter":
      return (offers.filters[target.field] ?? []).some(
        (offer) => offer.op === target.op && offer.offered,
      );
    case "group":
      return offers.groups.includes(target.field);
    case "sort":
      return offers.sorts.includes(target.field);
    case "thenBy":
      return offers.thenBy.includes(target.field);
  }
}

export function useOfferState(target: OfferTarget): OfferState {
  const { def } = useQueryGridMeta();
  const messages = useMessages();
  const locale = useLocale();
  const query = useQueryState();
  const context = useOfferContext();
  const offered = isOffered(useOffers(), target);
  return {
    offered,
    reason: offered
      ? null
      : formatReason(
          messages,
          def,
          explainUnavailable(def, query, target, context),
          locale,
        ),
  };
}

export function useFilterChips(): LabelledChip[] {
  const { def } = useQueryGridMeta();
  const messages = useMessages();
  const locale = useLocale();
  const currency = useCurrency();
  const query = useQueryState();
  const known = useFieldLabels();
  return listFilterChips(def, query, known, locale, currency).map((chip) => ({
    chip,
    item: formatChip(messages, def, chip),
  }));
}

export function useColumns(): ColumnsModel {
  const { def } = useQueryGridMeta();
  const { columns } = useQueryGridState();
  const state = useStoreValue(columns.subscribe, columns.getColumns);
  return { state, layout: layoutColumns(def.fields, state), store: columns };
}

export type RowSelection =
  | { kind: "none" }
  | { kind: "rows"; ids: string[] }
  | {
      kind: "matching";
      query: QueryState;
      scope: QueryScope | null;
      count: number | null;
      capped: boolean;
    };

function subscribeNothing(): () => void {
  return () => undefined;
}

// The count is read only while a selection needs it, so selecting adds no request the page was not already making.
function useSelectionCount(wanted: boolean): CountState {
  const { counts } = useQueryGridState();
  return useStoreValue(
    wanted ? counts.subscribe : subscribeNothing,
    counts.getState,
  );
}

export function useRowSelection(): RowSelection {
  const { scope } = useQueryGridMeta();
  const { selection } = useQueryGridState();
  const state = useStoreValue(selection.subscribe, selection.get);
  const query = useQueryState();
  const { result } = useSelectionCount(state.allMatching);
  if (state.allMatching) {
    return {
      kind: "matching",
      query,
      scope,
      count: result?.count ?? null,
      capped: result?.capped ?? false,
    };
  }
  return state.ids.length > 0
    ? { kind: "rows", ids: state.ids }
    : { kind: "none" };
}

export function useMatchingCount(): string | null {
  const messages = useMessages();
  const locale = useLocale();
  const { selection } = useQueryGridState();
  const state = useStoreValue(selection.subscribe, selection.get);
  const { result } = useSelectionCount(state.ids.length > 0);
  return result
    ? formatRows(messages, result.count, locale, result.capped)
    : null;
}

export interface ReorderOffer {
  offered: boolean;
  reason: string | null;
}

export function useReorderOffer(): ReorderOffer | null {
  const { def } = useQueryGridMeta();
  const messages = useMessages();
  const query = useQueryState();
  const feed = useFeedState();
  if (!canReorder(def)) {
    return null;
  }
  const problem = explainReorder(def, query, {
    loaded: feed.pages > 0 && feed.status === "idle",
    hasNext: feed.hasNext,
  });
  if (!problem) {
    return { offered: true, reason: null };
  }
  const code = problem.code as keyof typeof messages.reorderReasons;
  return {
    offered: false,
    reason: messages.reorderReasons[code]({
      label: getFieldLabel(def, def.orderField ?? ""),
    }),
  };
}
