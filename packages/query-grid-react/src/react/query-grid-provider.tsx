"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  createCountStore,
  createFacetStore,
  createFeed,
  createLabelStore,
  createLimitsStore,
  createNarrowedStore,
  createQueryStore,
  createStore,
  createTotalStore,
  isScopeEmpty,
  withScope,
  type DataSource,
  type QueryScope,
} from "@kikstart/query-grid";
import { throttle, useQueryStates } from "nuqs";

import {
  createColumnStore,
  createLocalStoragePersistence,
  type ColumnPersistence,
} from "../components/column-state.ts";
import type { GridDef } from "../components/fields.ts";
import { useLatest } from "../components/use-latest.ts";
import {
  QueryGridContext,
  type QueryGridContextValue,
  type SelectionState,
} from "./query-grid-context.tsx";
import {
  buildUrlParsers,
  normalizeQueryString,
  readUrlState,
  toQueryString,
  toUrlValues,
  type UrlValues,
} from "./url-state.ts";
import { createUrlSync, type UrlSync, type UrlWriter } from "./url-sync.ts";

const DEFAULT_PAGE_SIZE = 500;
const REPLACE_THROTTLE_MS = 250;

export interface QueryGridProviderProps {
  def: GridDef;
  source: DataSource;
  scope?: QueryScope;
  pageSize?: number;
  urlPrefix?: string;
  columnPersistence?: ColumnPersistence;
  children: ReactNode;
}

export interface StaticQueryGridProviderProps extends QueryGridProviderProps {
  queryString: string;
}

function createValue(
  props: QueryGridProviderProps,
  source: DataSource,
  queryString: string,
): QueryGridContextValue {
  const { def } = props;
  const initial = readUrlState(def, source.capabilities, queryString);
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
  const selection = createStore<SelectionState>({
    ids: [],
    allMatching: false,
    key: 0,
  });
  const scope = props.scope && !isScopeEmpty(props.scope) ? props.scope : null;
  return {
    state: {
      store,
      feed,
      counts,
      totals,
      facets,
      labels,
      limits: createLimitsStore(source),
      narrowed: createNarrowedStore(store, source),
      columns: createColumnStore(def.fields, persistence),
      selection,
    },
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
      fetchExport: (columns) =>
        source.fetchExport(
          store.getQuery(),
          { columns },
          new AbortController().signal,
        ),
      clearSelection: () =>
        selection.set({
          ids: [],
          allMatching: false,
          key: selection.get().key + 1,
        }),
      reorderRow: async (move) => {
        const before = feed.getState().rows;
        const from = before.findIndex((row) => row.id === move.id);
        const moved = before[from];
        if (!moved) {
          return;
        }
        feed.removeRow(move.id);
        feed.insertRow(move.index, moved);
        try {
          const changed = await source.reorderRow(move);
          changed.forEach((row) => feed.patchRow(row.id, row));
        } catch (error) {
          feed.removeRow(move.id);
          feed.insertRow(from, moved);
          throw error;
        }
      },
    },
    meta: { def, source, scope },
  };
}

interface GridSession {
  value: QueryGridContextValue;
  sync: UrlSync;
}

// The scope is read once, like the def: a grid whose scope changes is a new grid, remounted under a key.
function useScopedSource(props: QueryGridProviderProps): DataSource {
  const [source] = useState(() => withScope(props.source, props.scope ?? {}));
  return source;
}

function useGridSession(
  props: QueryGridProviderProps,
  source: DataSource,
  queryString: string,
  write: UrlWriter,
): GridSession {
  const [value] = useState(() => createValue(props, source, queryString));
  const [sync] = useState(() =>
    createUrlSync(value.state.store, queryString, write),
  );
  return { value, sync };
}

function useGridEffects(
  { value, sync }: GridSession,
  queryString: string,
): void {
  const { source } = value.meta;
  const { narrowed, columns } = value.state;

  useEffect(() => {
    void columns.restore();
  }, [columns]);

  useEffect(() => {
    if (!source.capabilities.narrowLimited) {
      return;
    }
    return narrowed.connect();
  }, [source, narrowed]);

  useEffect(() => {
    sync.follow(queryString);
  }, [sync, queryString]);
}

export function QueryGridProvider(props: QueryGridProviderProps) {
  const prefix = props.urlPrefix ?? "";
  const source = useScopedSource(props);
  const { capabilities } = source;
  const [def] = useState(() => props.def);
  const [parsers] = useState(() => buildUrlParsers(capabilities, prefix));
  const [urlValues, setUrlValues] = useQueryStates(parsers);
  const queryString = toQueryString(
    capabilities,
    urlValues as UrlValues,
    prefix,
  );
  const setter = useLatest(setUrlValues);
  const session = useGridSession(
    props,
    source,
    queryString,
    (state, history) => {
      void setter.current(
        toUrlValues(def, capabilities, state, prefix),
        history === "push"
          ? { history }
          : { history, limitUrlUpdates: throttle(REPLACE_THROTTLE_MS) },
      );
    },
  );

  useEffect(() => session.sync.connect(), [session.sync]);
  useGridEffects(session, queryString);

  return (
    <QueryGridContext value={session.value}>{props.children}</QueryGridContext>
  );
}

function ignoreWrite(): void {
  return;
}

export function StaticQueryGridProvider(props: StaticQueryGridProviderProps) {
  const source = useScopedSource(props);
  const queryString = normalizeQueryString(
    source.capabilities,
    props.queryString,
    props.urlPrefix ?? "",
  );
  const session = useGridSession(props, source, queryString, ignoreWrite);
  useGridEffects(session, queryString);

  return (
    <QueryGridContext value={session.value}>{props.children}</QueryGridContext>
  );
}
