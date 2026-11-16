import type { DataSource } from "./data-source.ts";
import type { Listener } from "./emitter.ts";
import { getFacetField, type BaseGridDef, type GridRow } from "./grid-def.ts";
import type { QueryState } from "./query-state.ts";
import type { DataSourceCapabilities } from "./capabilities.ts";
import { expandEquals } from "./field-values.ts";
import { isMatchAny } from "./indexes.ts";
import { createQueryStore } from "./query-store.ts";
import { createFeed, type Feed } from "./row-feed.ts";
import { createStore } from "./store.ts";

export const LANE_PAGE_SIZE = 50;

export interface BoardMove {
  id: string;
  from: string;
  to: string;
  index: number;
}

export interface BoardLaneState {
  rows: GridRow[];
  hasNext: boolean;
}

export interface BoardState {
  lanes: Map<string, BoardLaneState>;
  transitions: [string, string][] | null;
}

export interface Board {
  getState: () => BoardState;
  subscribe: (listener: Listener) => () => void;
  loadMore: (lane: string) => void;
  canMove: (from: string, to: string) => boolean;
  move: (move: BoardMove) => Promise<GridRow>;
}

interface TransitionLoad {
  value: [string, string][] | null;
  done: Promise<void>;
}

const transitionLoads = new WeakMap<DataSource, TransitionLoad>();

async function fetchTransitions(
  source: DataSource,
  load: TransitionLoad,
): Promise<void> {
  try {
    load.value = await source.fetchTransitions(new AbortController().signal);
  } catch {
    transitionLoads.delete(source);
  }
}

function loadTransitions(source: DataSource): TransitionLoad {
  const known = transitionLoads.get(source);
  if (known) {
    return known;
  }
  const load: TransitionLoad = { value: null, done: Promise.resolve() };
  transitionLoads.set(source, load);
  load.done = fetchTransitions(source, load);
  return load;
}

export function getLaneQueries(
  def: BaseGridDef,
  query: QueryState,
  capabilities: DataSourceCapabilities,
): Map<string, QueryState> | null {
  const field = getFacetField(def);
  if (!field?.options) {
    return null;
  }
  const holdsAllRows = capabilities.holdsAllRows;
  const chosen = query.equals[field.key];
  const selected = chosen ? expandEquals(field, chosen) : undefined;
  const statuses = field.options
    .map((option) => option.value)
    .filter((value) => selected === undefined || selected.includes(value));
  const base: QueryState = holdsAllRows
    ? { ...query, cursor: null }
    : { ...query, ranges: [], sort: def.defaultSort, cursor: null };
  const queries = new Map<string, QueryState>(
    statuses.map((status) => [
      status,
      { ...base, equals: { ...query.equals, [field.key]: [status] } },
    ]),
  );
  const plain =
    query.texts.length === 0 &&
    Object.keys(query.overlaps).length === 0 &&
    query.ranges.length === 0;
  const combinable =
    !isMatchAny(query) && (holdsAllRows || (query.search === null && plain));
  const answerable =
    combinable && [...queries.values()].every(capabilities.canRun);
  return answerable ? queries : null;
}

function sameLanes(
  current: Map<string, BoardLaneState>,
  next: Map<string, BoardLaneState>,
): boolean {
  return [...next].every(([lane, state]) => {
    const known = current.get(lane);
    return known?.rows === state.rows && known.hasNext === state.hasNext;
  });
}

export function createBoard(
  def: BaseGridDef,
  source: DataSource,
  laneQueries: Map<string, QueryState>,
  transitions: [string, string][] | null = null,
): Board {
  const feeds = new Map<string, Feed>(
    [...laneQueries].map(([lane, query]) => [
      lane,
      createFeed(
        createQueryStore(def, source.capabilities, query, "board"),
        source,
        LANE_PAGE_SIZE,
      ),
    ]),
  );
  const readLanes = () =>
    new Map<string, BoardLaneState>(
      [...feeds].map(([lane, feed]) => {
        const { rows, hasNext } = feed.getState();
        return [lane, { rows, hasNext }];
      }),
    );
  const store = createStore<BoardState>({
    lanes: readLanes(),
    transitions: transitions ?? transitionLoads.get(source)?.value ?? null,
  });
  let started = false;

  const followLanes = () => {
    const lanes = readLanes();
    if (!sameLanes(store.get().lanes, lanes)) {
      store.set({ ...store.get(), lanes });
    }
  };

  const followTransitions = async () => {
    const load = loadTransitions(source);
    await load.done;
    if (load.value && store.get().transitions !== load.value) {
      store.set({ ...store.get(), transitions: load.value });
    }
  };

  return {
    getState: store.get,
    subscribe: (listener) => {
      if (!started) {
        started = true;
        feeds.forEach((feed) => feed.subscribe(followLanes));
        if (!transitions) {
          void followTransitions();
        }
      }
      return store.subscribe(listener);
    },
    loadMore: (lane) => feeds.get(lane)?.loadMore(),
    canMove: (from, to) =>
      (store.get().transitions ?? []).some(
        ([start, end]) => start === from && end === to,
      ),
    move: async ({ id, from, to, index }) => {
      const updated = await source.changeFacetValue(id, to);
      feeds.get(from)?.removeRow(id);
      feeds.get(to)?.insertRow(index, updated);
      return updated;
    },
  };
}
