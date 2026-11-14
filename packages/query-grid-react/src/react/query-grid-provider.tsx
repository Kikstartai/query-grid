"use client";

import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  createCountStore,
  createFacetStore,
  createFeed,
  createLabelStore,
  createQueryStore,
  createTotalStore,
  decodeQuery,
  defaultQuery,
  encodeQuery,
  explainUnavailable,
  getFieldLabel,
  GRID_VIEWS,
  listFilterChips,
  listOffers,
  validateQueryValues,
  type Capabilities,
  type CountState,
  type CountStore,
  type DataSource,
  type FacetState,
  type FacetStore,
  type Feed,
  type FeedState,
  type FilterChip,
  type GridDef,
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
import { createHttpSource } from "@kikstart/query-grid/http";

import {
  createLocalStoragePersistence,
  layoutColumns,
  type ColumnPersistence,
  type ColumnState,
  type GridColumn,
} from "../components/column-state.ts";
import type { ClientFieldDef, ClientGridDef } from "../components/fields.ts";
import type { ChipItem } from "../components/filter-bar.tsx";
import {
  formatList,
  resolveLocale,
  useMessages,
  type QueryGridMessages,
} from "../components/messages.tsx";
import { useStoreValue } from "../components/use-store-value.ts";
import { createColumnStore, type ColumnStore } from "./column-store.ts";

const VIEW_PARAM = "view";
const DEFAULT_PAGE_SIZE = 500;

export interface QueryGridContextValue {
  def: ClientGridDef;
  store: QueryStore;
  source: DataSource;
  feed: Feed;
  counts: CountStore;
  totals: TotalStore;
  facets: FacetStore;
  labels: LabelStore;
  columns: ColumnStore;
}

export interface QueryGridProviderProps {
  def: ClientGridDef;
  search?: string;
  basePath?: string;
  capabilities?: Capabilities;
  source?: DataSource;
  pageSize?: number;
  syncUrl?: boolean;
  columnPersistence?: ColumnPersistence | null;
  children: ReactNode;
}

export interface ColumnsModel {
  state: ColumnState[];
  layout: GridColumn<ClientFieldDef>[];
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

interface UrlState {
  query: QueryState;
  view: GridView;
}

function readUrlState(
  def: GridDef,
  search: string,
  capabilities: Capabilities,
): UrlState {
  const params = new URLSearchParams(search);
  const decoded = decodeQuery(def, params);
  const usable =
    capabilities.isAnswerable(decoded) &&
    validateQueryValues(def, decoded) === null;
  return {
    query: usable ? decoded : defaultQuery(def),
    view: GRID_VIEWS.find((view) => view === params.get(VIEW_PARAM)) ?? "grid",
  };
}

function encodeUrlState(def: GridDef, state: UrlState): string {
  const params = encodeQuery(def, state.query);
  if (state.view !== "grid") {
    params.set(VIEW_PARAM, state.view);
  }
  return params.size > 0 ? `?${params}` : "";
}

function resolveSource(props: QueryGridProviderProps): DataSource {
  if (props.source) {
    return props.source;
  }
  if (!props.capabilities) {
    throw new Error("QueryGridProvider needs a source or capabilities");
  }
  return createHttpSource(props.def, props.basePath ?? "", props.capabilities);
}

function createValue(props: QueryGridProviderProps): QueryGridContextValue {
  const { def } = props;
  const source = resolveSource(props);
  const initial = readUrlState(def, props.search ?? "", source.capabilities);
  const store = createQueryStore(
    def,
    source.capabilities,
    initial.query,
    initial.view,
  );
  const persistence =
    props.columnPersistence === undefined
      ? createLocalStoragePersistence(`query-grid:${def.id}:columns`)
      : props.columnPersistence;
  return {
    def,
    store,
    source,
    feed: createFeed(store, source, props.pageSize ?? DEFAULT_PAGE_SIZE),
    counts: createCountStore(store, source),
    totals: createTotalStore(store, source),
    facets: createFacetStore(store, source),
    labels: createLabelStore(source),
    columns: createColumnStore(def.fields, persistence),
  };
}

function encodeStore(store: QueryStore): string {
  return encodeUrlState(store.def, {
    query: store.getQuery(),
    view: store.getView(),
  });
}

function mirrorToUrl(store: QueryStore): void {
  const search = encodeStore(store);
  if (search === window.location.search) {
    return;
  }
  const url = `${window.location.pathname}${search}`;
  if (store.getHistoryWrite() === "push") {
    window.history.pushState(null, "", url);
    return;
  }
  window.history.replaceState(null, "", url);
}

function followSearch(store: QueryStore, search: string): void {
  const next = readUrlState(store.def, search, store.getRules().capabilities);
  if (encodeUrlState(store.def, next) !== encodeStore(store)) {
    store.replace(next.query, next.view);
  }
}

export function QueryGridProvider(props: QueryGridProviderProps) {
  const [value] = useState(() => createValue(props));
  const syncUrl = props.syncUrl ?? true;
  const search = props.search ?? "";
  const appliedSearchRef = useRef(search);

  useEffect(() => {
    void value.columns.restore();
    if (!syncUrl) {
      return;
    }
    const followLocation = () =>
      followSearch(value.store, window.location.search);
    mirrorToUrl(value.store);
    const unsubscribe = value.store.subscribe(() => mirrorToUrl(value.store));
    window.addEventListener("popstate", followLocation);
    return () => {
      unsubscribe();
      window.removeEventListener("popstate", followLocation);
    };
  }, [value, syncUrl]);

  useEffect(() => {
    if (syncUrl) {
      followSearch(value.store, window.location.search);
    }
  });

  useEffect(() => {
    if (appliedSearchRef.current !== search) {
      appliedSearchRef.current = search;
      followSearch(value.store, search);
    }
  }, [value, search]);

  return <QueryGridContext value={value}>{props.children}</QueryGridContext>;
}

export function useQueryGrid(): QueryGridContextValue {
  const value = use(QueryGridContext);
  if (!value) {
    throw new Error("useQueryGrid needs a QueryGridProvider above it");
  }
  return value;
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
  def: GridDef,
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

export function useQueryDispatch(): (action: QueryAction) => void {
  return useQueryGrid().store.dispatch;
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
  def: GridDef,
  reason: UnavailableReason,
): string {
  const locale = resolveLocale(def.format);
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
  const query = useQueryState();
  const rules = useQueryRules();
  const offered = isOffered(useOffers(), target);
  return {
    offered,
    reason: offered
      ? null
      : formatReason(messages, def, explainUnavailable(query, target, rules)),
  };
}

export function formatChip(
  messages: QueryGridMessages,
  def: GridDef,
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
  const { def, labels } = useQueryGrid();
  const messages = useMessages();
  const query = useQueryState();
  const known = useFieldLabels();
  useEffect(() => {
    for (const [key, values] of Object.entries(query.equals)) {
      const field = def.fields.find((item) => item.key === key);
      if (field?.lookup) {
        values.forEach((value) => labels.request(key, value));
      }
    }
  }, [def, labels, query.equals]);
  return listFilterChips(def, query, known).map((chip) => ({
    chip,
    item: formatChip(messages, def, chip),
  }));
}

export function useColumns(): ColumnsModel {
  const { def, columns } = useQueryGrid();
  const state = useStoreValue(columns.subscribe, columns.getColumns);
  return { state, layout: layoutColumns(def.fields, state), store: columns };
}
