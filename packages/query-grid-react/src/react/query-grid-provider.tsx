"use client";

import { createContext, use, useEffect, useState, type ReactNode } from "react";

import {
  createCountStore,
  createFacetStore,
  createFeed,
  createLabelStore,
  createQueryStore,
  createTotalStore,
  explainUnavailable,
  getFieldLabel,
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
  type GridRow,
  type GridView,
  type LabelStore,
  type Offers,
  type OfferTarget,
  type QueryAction,
  type QueryRules,
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
  formatList,
  useLocale,
  useMessages,
  type QueryGridMessages,
} from "../components/messages.tsx";
import { useLatest } from "../components/use-latest.ts";
import { useStoreValue } from "../components/use-store-value.ts";
import {
  buildUrlParsers,
  normalizeSearch,
  readUrlState,
  toSearch,
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
  search: string;
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
  search: string,
): QueryGridContextValue {
  const { def, source } = props;
  const initial = readUrlState(def, source.capabilities, search);
  const store = createQueryStore(
    def,
    source.capabilities,
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

export function QueryGridProvider(props: QueryGridProviderProps) {
  const prefix = props.urlPrefix ?? "";
  const { capabilities } = props.source;
  const [parsers] = useState(() => buildUrlParsers(capabilities, prefix));
  const [values, setValues] = useQueryStates(parsers);
  const search = toSearch(capabilities, values as UrlValues, prefix);
  const [value] = useState(() => createValue(props, search));
  const setter = useLatest(setValues);
  const [sync] = useState(() =>
    createUrlSync(value.store, search, (state, history) => {
      void setter.current(
        toUrlValues(value.def, capabilities, state, prefix),
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

  useEffect(() => {
    sync.follow(search);
  }, [sync, search]);

  return <QueryGridContext value={value}>{props.children}</QueryGridContext>;
}

function ignoreWrite(): void {
  return;
}

export function StaticQueryGridProvider(props: StaticQueryGridProviderProps) {
  const search = normalizeSearch(
    props.source.capabilities,
    props.search,
    props.urlPrefix ?? "",
  );
  const [value] = useState(() => createValue(props, search));
  const [sync] = useState(() =>
    createUrlSync(value.store, search, ignoreWrite),
  );

  useEffect(() => {
    void value.columns.restore();
  }, [value]);

  useEffect(() => {
    sync.follow(search);
  }, [sync, search]);

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

export function useQueryRules(): QueryRules {
  const { store } = useQueryGrid();
  return useStoreValue(store.subscribe, store.getRules);
}

const offersByQuery = new WeakMap<QueryState, WeakMap<QueryRules, Offers>>();

function readOffers(
  def: BaseGridDef,
  query: QueryState,
  rules: QueryRules,
): Offers {
  const byRules = offersByQuery.get(query) ?? new WeakMap<QueryRules, Offers>();
  offersByQuery.set(query, byRules);
  const offers = byRules.get(rules) ?? listOffers(def, query, rules);
  byRules.set(rules, offers);
  return offers;
}

export function useOffers(): Offers {
  const { def } = useQueryGrid();
  return readOffers(def, useQueryState(), useQueryRules());
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

export function formatReason(
  messages: QueryGridMessages,
  def: BaseGridDef,
  reason: UnavailableReason,
  locale: string,
): string {
  const label = reason.field ? getFieldLabel(def, reason.field) : "";
  const blockers = formatList(locale, [
    ...reason.filters.map((key) =>
      messages.reasonParts.filter(getFieldLabel(def, key)),
    ),
    ...(reason.range
      ? [messages.reasonParts.range(getFieldLabel(def, reason.range))]
      : []),
    messages.reasonParts.sort(getFieldLabel(def, reason.sort)),
  ]);
  return messages.reasons[reason.code]({ label, blockers });
}

function isOffered(offers: Offers, target: OfferTarget): boolean {
  if (target.kind === "quick") {
    return offers.quick;
  }
  const fields = {
    equals: offers.equals,
    range: offers.ranges,
    sort: offers.sorts,
  }[target.kind];
  return fields.includes(target.field);
}

export function useOfferState(target: OfferTarget): OfferState {
  const { def } = useQueryGrid();
  const messages = useMessages();
  const locale = useLocale();
  const query = useQueryState();
  const rules = useQueryRules();
  const offered = isOffered(useOffers(), target);
  return {
    offered,
    reason: offered
      ? null
      : formatReason(
          messages,
          def,
          explainUnavailable(query, target, rules),
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
    "field" in chip ? getFieldLabel(def, chip.field) : messages.quickFilter;
  const removable = chip.clear !== null;
  switch (chip.kind) {
    case "equals":
      return {
        id: chip.id,
        kind: chip.kind,
        label: messages.chipEquals({ label }),
        values: chip.values.map((value) => ({
          id: value.value,
          label: value.text,
        })),
        removable,
      };
    case "range":
      return {
        id: chip.id,
        kind: chip.kind,
        label: messages.chipRange({
          label,
          min: chip.min ?? messages.openBound,
          max: chip.max ?? messages.openBound,
        }),
        removable,
      };
    case "quick":
      return {
        id: chip.id,
        kind: chip.kind,
        label: messages.chipQuick({ value: chip.value }),
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
