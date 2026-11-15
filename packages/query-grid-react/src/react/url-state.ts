import { parseAsNativeArrayOf, parseAsString } from "nuqs";

import {
  decodeQuery,
  encodeQuery,
  GRID_VIEWS,
  listQueryKeys,
  normalizeQuery,
  type Capabilities,
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

function listUrlKeys(capabilities: Capabilities): QueryKey[] {
  return [...listQueryKeys(capabilities), VIEW_KEY];
}

function urlName(key: QueryKey, prefix: string): string {
  return prefix ? `${prefix}.${key.name}` : key.name;
}

export function buildUrlParsers(capabilities: Capabilities, prefix = "") {
  return Object.fromEntries(
    listUrlKeys(capabilities).map((key) => [
      urlName(key, prefix),
      key.repeated ? parseAsNativeArrayOf(parseAsString) : parseAsString,
    ]),
  );
}

export function toSearch(
  capabilities: Capabilities,
  values: UrlValues,
  prefix = "",
): string {
  const params = new URLSearchParams();
  for (const key of listUrlKeys(capabilities)) {
    for (const item of [values[urlName(key, prefix)] ?? []].flat()) {
      params.append(key.name, item);
    }
  }
  return params.toString();
}

export function normalizeSearch(
  capabilities: Capabilities,
  search: string,
  prefix: string,
): string {
  if (!prefix) {
    return search;
  }
  const params = new URLSearchParams(search);
  const values = Object.fromEntries(
    listUrlKeys(capabilities).map((key) => [
      urlName(key, prefix),
      params.getAll(urlName(key, prefix)),
    ]),
  );
  return toSearch(capabilities, values, prefix);
}

export function readUrlState(
  def: BaseGridDef,
  capabilities: Capabilities,
  search: string,
): UrlState {
  const params = new URLSearchParams(search);
  return {
    query: normalizeQuery(def, capabilities, decodeQuery(def, params)),
    view:
      GRID_VIEWS.find((view) => view === params.get(VIEW_KEY.name)) ?? "grid",
  };
}

export function toUrlValues(
  def: BaseGridDef,
  capabilities: Capabilities,
  state: UrlState,
  prefix = "",
): UrlValues {
  const params = encodeQuery(def, state.query);
  if (state.view !== "grid") {
    params.set(VIEW_KEY.name, state.view);
  }
  return Object.fromEntries(
    listUrlKeys(capabilities).map((key) => [
      urlName(key, prefix),
      key.repeated ? params.getAll(key.name) : params.get(key.name),
    ]),
  );
}

export function encodeUrlState(
  def: BaseGridDef,
  capabilities: Capabilities,
  state: UrlState,
): string {
  return toSearch(capabilities, toUrlValues(def, capabilities, state));
}

export function readStoreState(store: QueryStore): UrlState {
  return { query: store.getQuery(), view: store.getView() };
}

export function encodeStore(store: QueryStore): string {
  return encodeUrlState(
    store.def,
    store.getRules().capabilities,
    readStoreState(store),
  );
}
