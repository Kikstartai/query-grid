import { parseAsNativeArrayOf, parseAsString } from "nuqs";

import {
  decodeQuery,
  encodeQuery,
  GRID_VIEWS,
  listQueryKeys,
  normalizeQuery,
  type RunnableQueries,
  type BaseGridDef,
  type GridView,
  type QueryKey,
  type QueryState,
  type QueryStore,
} from "@kikstart/query-grid";

const VIEW_KEY: QueryKey = { name: "view", repeated: false };

export type UrlValues = Record<string, string | string[] | null>;

export interface UrlState {
  query: QueryState;
  view: GridView;
}

function listUrlKeys(runnable: RunnableQueries): QueryKey[] {
  return [...listQueryKeys(runnable), VIEW_KEY];
}

function urlName(key: QueryKey, prefix: string): string {
  return prefix ? `${prefix}.${key.name}` : key.name;
}

export function buildUrlParsers(runnable: RunnableQueries, prefix = "") {
  return Object.fromEntries(
    listUrlKeys(runnable).map((key) => [
      urlName(key, prefix),
      key.repeated ? parseAsNativeArrayOf(parseAsString) : parseAsString,
    ]),
  );
}

export function toSearch(
  runnable: RunnableQueries,
  values: UrlValues,
  prefix = "",
): string {
  const params = new URLSearchParams();
  for (const key of listUrlKeys(runnable)) {
    for (const item of [values[urlName(key, prefix)] ?? []].flat()) {
      params.append(key.name, item);
    }
  }
  return params.toString();
}

export function normalizeSearch(
  runnable: RunnableQueries,
  search: string,
  prefix: string,
): string {
  const params = new URLSearchParams(search);
  const own = new URLSearchParams();
  for (const key of listUrlKeys(runnable)) {
    for (const value of params.getAll(urlName(key, prefix))) {
      own.append(key.name, value);
    }
  }
  return own.toString();
}

export function readUrlState(
  def: BaseGridDef,
  runnable: RunnableQueries,
  search: string,
): UrlState {
  const params = new URLSearchParams(search);
  return {
    query: normalizeQuery(def, runnable, decodeQuery(def, params)),
    view:
      GRID_VIEWS.find((view) => view === params.get(VIEW_KEY.name)) ?? "grid",
  };
}

export function toUrlValues(
  def: BaseGridDef,
  runnable: RunnableQueries,
  state: UrlState,
  prefix = "",
): UrlValues {
  const params = encodeQuery(def, state.query);
  if (state.view !== "grid") {
    params.set(VIEW_KEY.name, state.view);
  }
  return Object.fromEntries(
    listUrlKeys(runnable).map((key) => [
      urlName(key, prefix),
      key.repeated ? params.getAll(key.name) : params.get(key.name),
    ]),
  );
}

export function encodeUrlState(
  def: BaseGridDef,
  runnable: RunnableQueries,
  state: UrlState,
): string {
  return toSearch(runnable, toUrlValues(def, runnable, state));
}

export function readStoreState(store: QueryStore): UrlState {
  return { query: store.getQuery(), view: store.getView() };
}

export function encodeStore(store: QueryStore): string {
  return encodeUrlState(
    store.def,
    store.getOfferContext().runnable,
    readStoreState(store),
  );
}
