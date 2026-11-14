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

function listUrlKeys(def: GridDef): QueryKey[] {
  return [...listQueryKeys(def), VIEW_KEY];
}

export function buildUrlParsers(def: GridDef) {
  return Object.fromEntries(
    listUrlKeys(def).map((key) => [
      key.name,
      key.repeated ? parseAsNativeArrayOf(parseAsString) : parseAsString,
    ]),
  );
}

export function toSearch(def: GridDef, values: UrlValues): string {
  const params = new URLSearchParams();
  for (const key of listUrlKeys(def)) {
    for (const item of [values[key.name] ?? []].flat()) {
      params.append(key.name, item);
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
    view:
      GRID_VIEWS.find((view) => view === params.get(VIEW_KEY.name)) ?? "grid",
  };
}

export function toUrlValues(def: GridDef, state: UrlState): UrlValues {
  const params = encodeQuery(def, state.query);
  if (state.view !== "grid") {
    params.set(VIEW_KEY.name, state.view);
  }
  return Object.fromEntries(
    listUrlKeys(def).map((key) => [
      key.name,
      key.repeated ? params.getAll(key.name) : params.get(key.name),
    ]),
  );
}

export function encodeUrlState(def: GridDef, state: UrlState): string {
  return toSearch(def, toUrlValues(def, state));
}

export function readStoreState(store: QueryStore): UrlState {
  return { query: store.getQuery(), view: store.getView() };
}

export function encodeStore(store: QueryStore): string {
  return encodeUrlState(store.def, readStoreState(store));
}
