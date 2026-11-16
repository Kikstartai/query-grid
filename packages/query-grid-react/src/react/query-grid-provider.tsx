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
  createTotalStore,
  type DataSource,
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
  queryString: string,
): QueryGridContextValue {
  const { def, source } = props;
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
    },
    meta: { def, source },
  };
}

interface GridSession {
  value: QueryGridContextValue;
  sync: UrlSync;
}

function useGridSession(
  props: QueryGridProviderProps,
  queryString: string,
  write: UrlWriter,
): GridSession {
  const [value] = useState(() => createValue(props, queryString));
  const [sync] = useState(() =>
    createUrlSync(value.state.store, queryString, write),
  );
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

  return { value, sync };
}

export function QueryGridProvider(props: QueryGridProviderProps) {
  const prefix = props.urlPrefix ?? "";
  const { capabilities } = props.source;
  const [parsers] = useState(() => buildUrlParsers(capabilities, prefix));
  const [urlValues, setUrlValues] = useQueryStates(parsers);
  const queryString = toQueryString(
    capabilities,
    urlValues as UrlValues,
    prefix,
  );
  const setter = useLatest(setUrlValues);
  const { value, sync } = useGridSession(
    props,
    queryString,
    (state, history) => {
      void setter.current(
        toUrlValues(props.def, capabilities, state, prefix),
        history === "push"
          ? { history }
          : { history, limitUrlUpdates: throttle(REPLACE_THROTTLE_MS) },
      );
    },
  );

  useEffect(() => sync.connect(), [sync]);

  return <QueryGridContext value={value}>{props.children}</QueryGridContext>;
}

function ignoreWrite(): void {
  return;
}

export function StaticQueryGridProvider(props: StaticQueryGridProviderProps) {
  const queryString = normalizeQueryString(
    props.source.capabilities,
    props.queryString,
    props.urlPrefix ?? "",
  );
  const { value } = useGridSession(props, queryString, ignoreWrite);

  return <QueryGridContext value={value}>{props.children}</QueryGridContext>;
}
