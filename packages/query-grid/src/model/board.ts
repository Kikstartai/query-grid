import type { DataSource } from "./data-source.ts";
import type { Listener } from "./emitter.ts";
import {
  getFacetField,
  type Capabilities,
  type GridDef,
  type GridRow,
  type QueryState,
} from "./field-types.ts";
import { createQueryStore } from "./query-store.ts";
import { createFeed, type Feed, type FeedState } from "./row-feed.ts";
import { createStore } from "./store.ts";

export const LANE_PAGE_SIZE = 50;

export interface BoardMove {
  id: string;
  from: string;
  to: string;
  index: number;
}

export interface BoardState {
  lanes: Map<string, FeedState>;
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
  def: GridDef,
  query: QueryState,
  capabilities: Capabilities,
): Map<string, QueryState> | null {
  const field = getFacetField(def);
  if (!field?.options) {
    return null;
  }
  const memory = capabilities.mode === "memory";
  const selected = query.equals[field.key];
  const statuses = field.options
    .map((option) => option.value)
    .filter((value) => selected === undefined || selected.includes(value));
  const base: QueryState = memory
    ? { ...query, cursor: null }
    : { ...query, range: null, sort: def.defaultSort, cursor: null };
  const queries = new Map<string, QueryState>(
    statuses.map((status) => [
      status,
      { ...base, equals: { ...query.equals, [field.key]: [status] } },
    ]),
  );
  const combinable = memory || (query.quick === null && query.range === null);
  const answerable =
    combinable && [...queries.values()].every(capabilities.isAnswerable);
  return answerable ? queries : null;
}

function sameLanes(
  current: Map<string, FeedState>,
  next: Map<string, FeedState>,
): boolean {
  return [...next].every(([lane, state]) => {
    const known = current.get(lane);
    return known?.rows === state.rows && known.hasNext === state.hasNext;
  });
}

export function createBoard(
  def: GridDef,
  source: DataSource,
  laneQueries: Map<string, QueryState>,
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
    new Map([...feeds].map(([lane, feed]) => [lane, feed.getState()]));
  const store = createStore<BoardState>({
    lanes: readLanes(),
    transitions: transitionLoads.get(source)?.value ?? null,
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
        void followTransitions();
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
