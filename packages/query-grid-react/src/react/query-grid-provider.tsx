"use client";

import { createContext, use, useEffect, useState, type ReactNode } from "react";

import {
  createCountStore,
  createFacetStore,
  createFeed,
  createLabelStore,
  createLimitsStore,
  createNarrowedStore,
  createQueryStore,
  createTotalStore,
  explainUnavailable,
  getFieldLabel,
  isDatePreset,
  listFilterChips,
  listOffers,
  type Board,
  type BoardMove,
  type CountState,
  type CountStore,
  type DataSource,
  type FacetState,
  type FacetStore,
  type Feed,
  type FeedState,
  type FieldOption,
  type FilterChip,
  type BaseGridDef,
  type GridLimits,
  type GridRow,
  type GridView,
  type LabelStore,
  type LimitsStore,
  type NarrowedStore,
  type Offers,
  type OfferTarget,
  type QueryAction,
  type OfferContext,
  type QueryState,
  type QueryStore,
  type TotalState,
  type TotalStore,
  type UnavailableReason,
} from "@kikstart/query-grid";
import { throttle, useQueryStates } from "nuqs";

import {
  createColumnStore,
  createLocalStoragePersistence,
  layoutColumns,
  type ColumnPersistence,
  type ColumnState,
  type ColumnStore,
  type GridColumn,
} from "../components/column-state.ts";
import type { FieldDef, GridDef } from "../components/fields.ts";
import type { ChipItem } from "../components/filter-bar.tsx";
import {
  countParams,
  formatList,
  formatReservedValue,
  formatRows,
  useLocale,
  useMessages,
  type QueryGridMessages,
} from "../components/messages.tsx";
import { useLatest } from "../components/use-latest.ts";
import { useStoreValue } from "../components/use-store-value.ts";
import {
  buildUrlParsers,
  normalizeQueryString,
  readUrlState,
  toQueryString,
  toUrlValues,
  type UrlValues,
} from "./url-state.ts";
import { createUrlSync } from "./url-sync.ts";

const DEFAULT_PAGE_SIZE = 500;
const REPLACE_THROTTLE_MS = 250;

export interface QueryGridContextValue {
  def: GridDef;
  store: QueryStore;
  source: DataSource;
  feed: Feed;
  counts: CountStore;
  totals: TotalStore;
  facets: FacetStore;
  labels: LabelStore;
  limits: LimitsStore;
  narrowed: NarrowedStore;
  columns: ColumnStore;
  actions: QueryGridActions;
}

export interface QueryGridActions {
  dispatch: (action: QueryAction) => void;
  loadMore: () => void;
  requestExact: () => void;
  setView: (view: GridView) => void;
  rememberLabel: (field: string, value: string, label: string) => void;
  loadOptions: (
    field: string,
    text: string,
    signal: AbortSignal,
  ) => Promise<FieldOption[]>;
  moveRow: (board: Board, move: BoardMove) => Promise<GridRow>;
}

export interface QueryGridProviderProps {
  def: GridDef;
  source: DataSource;
  pageSize?: number;
  urlPrefix?: string;
  columnPersistence?: ColumnPersistence;
  children: ReactNode;
}

export interface StaticQueryGridProviderProps extends QueryGridProviderProps {
  queryString: string;
}

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

const QueryGridContext = createContext<QueryGridContextValue | null>(null);

function createValue(
  props: QueryGridProviderProps,
  queryString: string,
): QueryGridContextValue {
  const { def, source } = props;
  const initial = readUrlState(def, source.runnable, queryString);
  const store = createQueryStore(
    def,
    source.runnable,
    initial.query,
    initial.view,
  );
  const persistence =
    props.columnPersistence ??
    createLocalStoragePersistence(`query-grid:${def.id}:columns`);
  const feed = createFeed(store, source, props.pageSize ?? DEFAULT_PAGE_SIZE);
  const counts = createCountStore(store, source);
  const labels = createLabelStore(store, source);
  const totals = createTotalStore(store, source);
  const facets = createFacetStore(store, source);
  return {
    def,
    store,
    source,
    feed,
    counts,
    totals,
    facets,
    labels,
    limits: createLimitsStore(source),
    narrowed: createNarrowedStore(store, source),
    columns: createColumnStore(def.fields, persistence),
    actions: {
      dispatch: store.dispatch,
      loadMore: feed.loadMore,
      requestExact: counts.requestExact,
      setView: store.setView,
      rememberLabel: labels.remember,
      loadOptions: (field, text, signal) =>
        source.fetchOptions(field, { query: text }, signal),
      moveRow: async (board, move) => {
        const updated = await board.move(move);
        feed.patchRow(move.id, updated);
        facets.reload();
        counts.reload();
        totals.reload();
        return updated;
      },
    },
  };
}

function ignoreChange(): void {
  return;
}

function useNarrowedSizes({ source, narrowed }: QueryGridContextValue): void {
  useEffect(() => {
    if (!source.runnable.narrowLimited) {
      return;
    }
    return narrowed.subscribe(ignoreChange);
  }, [source, narrowed]);
}

export function QueryGridProvider(props: QueryGridProviderProps) {
  const prefix = props.urlPrefix ?? "";
  const { runnable } = props.source;
  const [parsers] = useState(() => buildUrlParsers(runnable, prefix));
  const [values, setValues] = useQueryStates(parsers);
  const queryString = toQueryString(runnable, values as UrlValues, prefix);
  const [value] = useState(() => createValue(props, queryString));
  const setter = useLatest(setValues);
  const [sync] = useState(() =>
    createUrlSync(value.store, queryString, (state, history) => {
      void setter.current(
        toUrlValues(value.def, runnable, state, prefix),
        history === "push"
          ? { history }
          : { history, limitUrlUpdates: throttle(REPLACE_THROTTLE_MS) },
      );
    }),
  );

  useEffect(() => {
    void value.columns.restore();
    return sync.connect();
  }, [value, sync]);

  useNarrowedSizes(value);

  useEffect(() => {
    sync.follow(queryString);
  }, [sync, queryString]);

  return <QueryGridContext value={value}>{props.children}</QueryGridContext>;
}

function ignoreWrite(): void {
  return;
}

export function StaticQueryGridProvider(props: StaticQueryGridProviderProps) {
  const queryString = normalizeQueryString(
    props.source.runnable,
    props.queryString,
    props.urlPrefix ?? "",
  );
  const [value] = useState(() => createValue(props, queryString));
  const [sync] = useState(() =>
    createUrlSync(value.store, queryString, ignoreWrite),
  );

  useEffect(() => {
    void value.columns.restore();
  }, [value]);

  useNarrowedSizes(value);

  useEffect(() => {
    sync.follow(queryString);
  }, [sync, queryString]);

  return <QueryGridContext value={value}>{props.children}</QueryGridContext>;
}

export function useQueryGrid(): QueryGridContextValue {
  const value = use(QueryGridContext);
  if (!value) {
    throw new Error("useQueryGrid needs a QueryGridProvider above it");
  }
  return value;
}

export function useQueryGridActions(): QueryGridActions {
  return useQueryGrid().actions;
}

export function useQueryState(): QueryState {
  const { store } = useQueryGrid();
  return useStoreValue(store.subscribe, store.getQuery);
}

export function useGridView(): GridView {
  const { store } = useQueryGrid();
  return useStoreValue(store.subscribe, store.getView);
}

export function useOfferContext(): OfferContext {
  const { store } = useQueryGrid();
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
  const { def } = useQueryGrid();
  return readOffers(def, useQueryState(), useOfferContext());
}

export function useFeedState(): FeedState {
  const { feed } = useQueryGrid();
  return useStoreValue(feed.subscribe, feed.getState);
}

export function useCountState(): CountState {
  const { counts } = useQueryGrid();
  return useStoreValue(counts.subscribe, counts.getState);
}

export function useTotalState(): TotalState {
  const { totals } = useQueryGrid();
  return useStoreValue(totals.subscribe, totals.getState);
}

export function useFacetState(): FacetState {
  const { facets } = useQueryGrid();
  return useStoreValue(facets.subscribe, facets.getState);
}

export function useFieldLabels(): Record<string, string> {
  const { labels } = useQueryGrid();
  return useStoreValue(labels.subscribe, labels.getLabels);
}

export function useGridLimits(): GridLimits | null {
  const { limits } = useQueryGrid();
  return useStoreValue(limits.subscribe, limits.getLimits);
}

export function formatReason(
  messages: QueryGridMessages,
  def: BaseGridDef,
  reason: UnavailableReason,
  locale: string,
): string {
  const label = reason.field ? getFieldLabel(def, reason.field) : "";
  const count = formatRows(messages, reason.rows ?? 0, locale);
  const rows = reason.capped
    ? messages.rowsCapped(countParams(reason.rows ?? 0, locale))
    : count;
  const narrowBy = formatList(
    locale,
    reason.narrowBy.map((key) => getFieldLabel(def, key)),
    "disjunction",
  );
  const blockers = formatList(locale, [
    ...reason.filters.map((key) =>
      messages.reasonParts.filter(getFieldLabel(def, key)),
    ),
    ...reason.ranges.map((key) =>
      messages.reasonParts.range(getFieldLabel(def, key)),
    ),
    messages.reasonParts.sort(getFieldLabel(def, reason.sort)),
  ]);
  return messages.reasons[reason.code]({ label, blockers, rows, narrowBy });
}

function isOffered(offers: Offers, target: OfferTarget): boolean {
  if (target.kind === "search") {
    return offers.search;
  }
  if (target.kind === "match") {
    return offers.matchAny;
  }
  const fields = {
    equals: offers.equals,
    range: offers.ranges,
    contains: offers.contains,
    sort: offers.sorts,
  }[target.kind];
  return fields.includes(target.field);
}

export function useOfferState(target: OfferTarget): OfferState {
  const { def } = useQueryGrid();
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
          explainUnavailable(query, target, context),
          locale,
        ),
  };
}

export function formatChip(
  messages: QueryGridMessages,
  def: BaseGridDef,
  chip: FilterChip,
): ChipItem {
  const label =
    "field" in chip ? getFieldLabel(def, chip.field) : messages.searchFilter;
  const removable = chip.clear !== null;
  switch (chip.kind) {
    case "equals":
      return {
        id: chip.id,
        kind: chip.kind,
        label: chip.excluded
          ? messages.chipExclude({ label })
          : messages.chipEquals({ label }),
        values: chip.values.map((value) => ({
          id: value.value,
          label: value.reserved
            ? formatReservedValue(messages, value.reserved)
            : value.text,
        })),
        removable,
      };
    case "range":
      return {
        id: chip.id,
        kind: chip.kind,
        label:
          chip.preset !== null && isDatePreset(chip.preset)
            ? messages.chipPreset({
                label,
                preset: messages.datePresets[chip.preset],
              })
            : messages.chipRange({
                label,
                min: chip.min ?? messages.openBound,
                max: chip.max ?? messages.openBound,
              }),
        removable,
      };
    case "contains":
      return {
        id: chip.id,
        kind: chip.kind,
        label: messages.chipContains({ label, value: chip.value }),
        removable,
      };
    case "match":
      return {
        id: chip.id,
        kind: chip.kind,
        label: messages.chipMatchAny,
        removable,
      };
    case "search":
      return {
        id: chip.id,
        kind: chip.kind,
        label: messages.chipSearch({ value: chip.value }),
        removable,
      };
    case "sort":
      return {
        id: chip.id,
        kind: chip.kind,
        label: messages.chipSort({
          label,
          direction: chip.direction === "asc" ? "↑" : "↓",
        }),
        removable,
      };
  }
}

export function useFilterChips(): LabelledChip[] {
  const { def } = useQueryGrid();
  const messages = useMessages();
  const locale = useLocale();
  const query = useQueryState();
  const known = useFieldLabels();
  return listFilterChips(def, query, known, locale).map((chip) => ({
    chip,
    item: formatChip(messages, def, chip),
  }));
}

export function useColumns(): ColumnsModel {
  const { def, columns } = useQueryGrid();
  const state = useStoreValue(columns.subscribe, columns.getColumns);
  return { state, layout: layoutColumns(def.fields, state), store: columns };
}
