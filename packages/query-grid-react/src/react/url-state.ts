import { parseAsNativeArrayOf, parseAsString } from "nuqs";

import {
  decodeQuery,
  encodeQuery,
  GRID_VIEWS,
  listQueryKeys,
  normalizeQuery,
  type Capabilities,
  type GridDef,
  type GridView,
  type QueryState,
  type QueryStore,
} from "@kikstart/query-grid";

export const VIEW_PARAM = "view";

export type UrlValues = Record<string, string | string[] | null>;

export interface UrlState {
  query: QueryState;
  view: GridView;
}

export function buildUrlParsers(def: GridDef) {
  const keys = listQueryKeys(def);
  return {
    ...Object.fromEntries(
      keys.repeated.map((key) => [key, parseAsNativeArrayOf(parseAsString)]),
    ),
    ...Object.fromEntries(
      [...keys.single, VIEW_PARAM].map((key) => [key, parseAsString]),
    ),
  };
}

export function toSearch(def: GridDef, values: UrlValues): string {
  const keys = listQueryKeys(def);
  const params = new URLSearchParams();
  for (const key of [...keys.repeated, ...keys.single, VIEW_PARAM]) {
    for (const item of [values[key] ?? []].flat()) {
      params.append(key, item);
    }
  }
  return params.toString();
}

export function readUrlState(
  def: GridDef,
  capabilities: Capabilities,
  search: string,
): UrlState {
  const params = new URLSearchParams(search);
  return {
    query: normalizeQuery(def, capabilities, decodeQuery(def, params)),
    view: GRID_VIEWS.find((view) => view === params.get(VIEW_PARAM)) ?? "grid",
  };
}

export function encodeUrlState(def: GridDef, state: UrlState): URLSearchParams {
  const params = encodeQuery(def, state.query);
  if (state.view !== "grid") {
    params.set(VIEW_PARAM, state.view);
  }
  return params;
}

export function toUrlValues(def: GridDef, state: UrlState): UrlValues {
  const keys = listQueryKeys(def);
  const params = encodeUrlState(def, state);
  return {
    ...Object.fromEntries(
      keys.repeated.map((key) => [key, params.getAll(key)]),
    ),
    ...Object.fromEntries(
      [...keys.single, VIEW_PARAM].map((key) => [key, params.get(key)]),
    ),
  };
}

export function readStoreState(store: QueryStore): UrlState {
  return { query: store.getQuery(), view: store.getView() };
}

export function encodeStore(store: QueryStore): string {
  return toSearch(store.def, toUrlValues(store.def, readStoreState(store)));
}
