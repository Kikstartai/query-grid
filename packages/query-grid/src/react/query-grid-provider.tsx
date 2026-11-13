"use client";

import {
  createContext,
  use,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  createColumnStore,
  createLocalStoragePersistence,
  layoutColumns,
  type ColumnPersistence,
  type ColumnState,
  type ColumnStore,
  type GridColumn,
} from "../model/column-state.ts";
import { createHttpSource, type DataSource } from "../model/data-source.ts";
import type { GridDef, QueryRules, QueryState } from "../model/field-types.ts";
import { listFilterChips, type FilterChip } from "../model/format.ts";
import {
  defaultQuery,
  listOffers,
  type Offers,
  type QueryAction,
} from "../model/query-actions.ts";
import {
  createQueryStore,
  GRID_VIEWS,
  type GridView,
  type QueryStore,
} from "../model/query-store.ts";
import { decodeQuery, encodeQuery } from "../model/query-url.ts";
import { validateQueryValues } from "../model/query-validate.ts";
import { isAnswerable } from "../model/shapes.ts";
import {
  createCountStore,
  createFacetStore,
  createFeed,
  createLabelStore,
  createTotalStore,
  type CountState,
  type CountStore,
  type FacetState,
  type FacetStore,
  type Feed,
  type FeedState,
  type LabelStore,
  type TotalState,
  type TotalStore,
} from "./feed.ts";

const VIEW_PARAM = "view";
const DEFAULT_PAGE_SIZE = 500;

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
}

export interface QueryGridProviderProps {
  def: GridDef;
  search?: string;
  basePath?: string;
  source?: DataSource;
  pageSize?: number;
  syncUrl?: boolean;
  columnPersistence?: ColumnPersistence | null;
  children: ReactNode;
}

export interface ColumnsModel {
  state: ColumnState[];
  layout: GridColumn[];
  store: ColumnStore;
}

const QueryGridContext = createContext<QueryGridContextValue | null>(null);

function readView(raw: string | null): GridView {
  return GRID_VIEWS.find((view) => view === raw) ?? "grid";
}

function readQuery(
  def: GridDef,
  params: URLSearchParams,
  source: DataSource,
): QueryState {
  const decoded = decodeQuery(def, params);
  const usable =
    isAnswerable(def, decoded, source.mode) &&
    validateQueryValues(def, decoded) === null;
  return usable ? decoded : defaultQuery(def);
}

function createValue(props: QueryGridProviderProps): QueryGridContextValue {
  const { def } = props;
  const params = new URLSearchParams(props.search ?? "");
  const source = props.source ?? createHttpSource(def, props.basePath ?? "");
  const store = createQueryStore(
    def,
    readQuery(def, params, source),
    readView(params.get(VIEW_PARAM)),
    source.mode,
  );
  const persistence =
    props.columnPersistence === undefined
      ? createLocalStoragePersistence(`query-grid:${def.table}:columns`)
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
    columns: createColumnStore(def, persistence),
  };
}

function mirrorToUrl(store: QueryStore): void {
  const params = encodeQuery(store.def, store.getQuery());
  if (store.getView() !== "grid") {
    params.set(VIEW_PARAM, store.getView());
  }
  const search = params.size > 0 ? `?${params}` : "";
  if (search !== window.location.search) {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search}`,
    );
  }
}

export function QueryGridProvider(props: QueryGridProviderProps) {
  const [value] = useState(() => createValue(props));
  const syncUrl = props.syncUrl ?? true;
  useEffect(() => {
    void value.columns.restore();
    if (!syncUrl) {
      return;
    }
    mirrorToUrl(value.store);
    return value.store.subscribe(() => mirrorToUrl(value.store));
  }, [value, syncUrl]);
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
  return useSyncExternalStore(store.subscribe, store.getQuery, store.getQuery);
}

export function useGridView(): GridView {
  const { store } = useQueryGrid();
  return useSyncExternalStore(store.subscribe, store.getView, store.getView);
}

export function useQueryRules(): QueryRules {
  const { store } = useQueryGrid();
  return useSyncExternalStore(store.subscribe, store.getRules, store.getRules);
}

export function useOffers(): Offers {
  const { def } = useQueryGrid();
  return listOffers(def, useQueryState(), useQueryRules());
}

export function useQueryDispatch(): (action: QueryAction) => void {
  return useQueryGrid().store.dispatch;
}

export function useFeedState(): FeedState {
  const { feed } = useQueryGrid();
  return useSyncExternalStore(feed.subscribe, feed.getState, feed.getState);
}

export function useCountState(): CountState {
  const { counts } = useQueryGrid();
  return useSyncExternalStore(
    counts.subscribe,
    counts.getState,
    counts.getState,
  );
}

export function useTotalState(): TotalState {
  const { totals } = useQueryGrid();
  return useSyncExternalStore(
    totals.subscribe,
    totals.getState,
    totals.getState,
  );
}

export function useFacetState(): FacetState {
  const { facets } = useQueryGrid();
  return useSyncExternalStore(
    facets.subscribe,
    facets.getState,
    facets.getState,
  );
}

export function useFieldLabels(): Record<string, string> {
  const { labels } = useQueryGrid();
  return useSyncExternalStore(
    labels.subscribe,
    labels.getLabels,
    labels.getLabels,
  );
}

export function useFilterChips(): FilterChip[] {
  const { def, labels } = useQueryGrid();
  const query = useQueryState();
  const known = useFieldLabels();
  useEffect(() => {
    for (const [key, value] of Object.entries(query.equals)) {
      const field = def.fields.find((item) => item.key === key);
      if (field?.lookup) {
        labels.request(key, value);
      }
    }
  }, [def, labels, query.equals]);
  return listFilterChips(def, query, known);
}

export function useColumns(): ColumnsModel {
  const { def, columns } = useQueryGrid();
  const state = useSyncExternalStore(
    columns.subscribe,
    columns.getColumns,
    columns.getColumns,
  );
  return { state, layout: layoutColumns(def, state), store: columns };
}
