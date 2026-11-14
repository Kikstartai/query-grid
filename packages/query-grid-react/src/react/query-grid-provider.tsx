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
  explainUnavailable,
  getFieldLabel,
  listFilterChips,
  listOffers,
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
import { throttle, useQueryStates } from "nuqs";

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
import {
  buildUrlParsers,
  encodeStore,
  encodeUrlState,
  readStoreState,
  readUrlState,
  toSearch,
  toUrlValues,
  type UrlState,
  type UrlValues,
} from "./url-state.ts";

const DEFAULT_PAGE_SIZE = 500;
const REPLACE_THROTTLE_MS = 250;
const PENDING_WRITE_MS = 1000;

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

function resolveSource(props: QueryGridProviderProps): DataSource {
  if (props.source) {
    return props.source;
  }
  if (!props.capabilities) {
    throw new Error("QueryGridProvider needs a source or capabilities");
  }
  return createHttpSource(props.def, props.basePath ?? "", props.capabilities);
}

function createValue(
  props: QueryGridProviderProps,
  source: DataSource,
  initial: UrlState,
): QueryGridContextValue {
  const { def } = props;
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

function createFromSearch(
  props: QueryGridProviderProps,
  search: string,
): QueryGridContextValue {
  const source = resolveSource(props);
  return createValue(
    props,
    source,
    readUrlState(props.def, source.capabilities, search),
  );
}

interface PendingWrite {
  search: string;
  at: number;
}

function followSearch(store: QueryStore, search: string): void {
  const next = readUrlState(store.def, store.getRules().capabilities, search);
  if (encodeUrlState(store.def, next) !== encodeStore(store)) {
    store.replace(next.query, next.view);
  }
}

function UrlQueryGridProvider(props: QueryGridProviderProps) {
  const [parsers] = useState(() => buildUrlParsers(props.def));
  const [values, setValues] = useQueryStates(parsers);
  const search = toSearch(props.def, values as UrlValues);
  const [value] = useState(() => createFromSearch(props, search));
  const pendingRef = useRef<PendingWrite[]>([]);
  const writtenRef = useRef(search);

  useEffect(() => {
    void value.columns.restore();
    const { store } = value;
    return store.subscribe(() => {
      const target = encodeStore(store);
      if (target === writtenRef.current) {
        return;
      }
      writtenRef.current = target;
      pendingRef.current.push({ search: target, at: Date.now() });
      const push = store.getHistoryWrite() === "push";
      void setValues(
        toUrlValues(store.def, readStoreState(store)),
        push
          ? { history: "push" }
          : {
              history: "replace",
              limitUrlUpdates: throttle(REPLACE_THROTTLE_MS),
            },
      );
    });
  }, [value, setValues]);

  useEffect(() => {
    const { store } = value;
    const fresh = pendingRef.current.filter(
      (write) => Date.now() - write.at < PENDING_WRITE_MS,
    );
    const echoed = fresh.findIndex((write) => write.search === search);
    pendingRef.current = echoed < 0 ? [] : fresh.slice(echoed + 1);
    if (echoed >= 0) {
      return;
    }
    const next = readUrlState(store.def, store.getRules().capabilities, search);
    const target = encodeUrlState(store.def, next);
    writtenRef.current = target;
    if (target !== encodeStore(store)) {
      store.replace(next.query, next.view);
    }
    if (target !== search) {
      void setValues(toUrlValues(store.def, next), { history: "replace" });
    }
  }, [value, search, setValues]);

  return <QueryGridContext value={value}>{props.children}</QueryGridContext>;
}

function StaticQueryGridProvider(props: QueryGridProviderProps) {
  const search = props.search ?? "";
  const [value] = useState(() => createFromSearch(props, search));
  const appliedRef = useRef(search);

  useEffect(() => {
    void value.columns.restore();
  }, [value]);

  useEffect(() => {
    if (appliedRef.current !== search) {
      appliedRef.current = search;
      followSearch(value.store, search);
    }
  }, [value, search]);

  return <QueryGridContext value={value}>{props.children}</QueryGridContext>;
}

export function QueryGridProvider(props: QueryGridProviderProps) {
  if (props.syncUrl === false) {
    return <StaticQueryGridProvider {...props} />;
  }
  return <UrlQueryGridProvider {...props} />;
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
