import type { DataSource } from "./data-source.ts";
import type { Listener } from "./emitter.ts";
import {
  getField,
  type BaseFieldDef,
  type BaseGridDef,
  type GridRow,
  type GridValue,
  type QueryState,
} from "./field-types.ts";
import { EMPTY_VALUE } from "./field-values.ts";
import { createAbortable, isAbort, type LoadStatus } from "./load.ts";
import { toProblem, type Problem } from "./problems.ts";
import { createQueryStore } from "./query-store.ts";
import { createFeed, type Feed } from "./row-feed.ts";
import { createStore } from "./store.ts";
import type { GroupHeader, GroupsResult } from "./wire-types.ts";

export const GROUP_PAGE_SIZE = 50;
export const GROUP_LIMIT = 200;

export interface GroupState {
  header: GroupHeader;
  expanded: boolean;
  rows: GridRow[];
  hasNext: boolean;
  status: LoadStatus;
  error: Problem | null;
}

export interface GroupingState {
  status: LoadStatus;
  error: Problem | null;
  loaded: boolean;
  source: GroupsResult["source"] | null;
  truncated: boolean;
  groups: GroupState[];
}

export interface Grouping {
  getState: () => GroupingState;
  subscribe: (listener: Listener) => () => void;
  toggle: (value: string) => void;
  loadMore: (value: string) => void;
}

export function getGroupQuery(query: QueryState, value: string): QueryState {
  if (query.group === null) {
    return query;
  }
  return {
    ...query,
    group: null,
    cursor: null,
    equals: { ...query.equals, [query.group]: [value] },
  };
}

export function toGroupValue(
  field: BaseFieldDef | null,
  value: GridValue | undefined,
): string | null {
  if (value !== null && value !== undefined) {
    return String(value);
  }
  return field?.nullable ? EMPTY_VALUE : null;
}

export function sortGroups(
  def: BaseGridDef,
  key: string,
  groups: GroupHeader[],
): GroupHeader[] {
  const options = getField(def, key)?.options;
  if (!options) {
    return [...groups].sort(
      (a, b) => b.count - a.count || a.value.localeCompare(b.value),
    );
  }
  const order = (value: string) => {
    const at = options.findIndex((option) => option.value === value);
    return at < 0 ? options.length : at;
  };
  return [...groups].sort((a, b) => order(a.value) - order(b.value));
}

function closedGroup(header: GroupHeader): GroupState {
  return {
    header,
    expanded: false,
    rows: [],
    hasNext: false,
    status: "idle",
    error: null,
  };
}

const UNANSWERED: Problem = { code: "unindexed_query", params: {} };

export function createGrouping(
  def: BaseGridDef,
  source: DataSource,
  query: QueryState,
  pageSize: number = GROUP_PAGE_SIZE,
): Grouping {
  const store = createStore<GroupingState>({
    status: "idle",
    error: null,
    loaded: false,
    source: null,
    truncated: false,
    groups: [],
  });
  const feeds = new Map<string, Feed>();
  const begin = createAbortable();
  let readers = 0;
  let pending: AbortController | null = null;

  const patchGroup = (value: string, patch: Partial<GroupState>) => {
    const state = store.get();
    store.set({
      ...state,
      groups: state.groups.map((group) =>
        group.header.value === value ? { ...group, ...patch } : group,
      ),
    });
  };

  const load = async () => {
    const controller = begin();
    pending = controller;
    store.set({ ...store.get(), status: "loading", error: null });
    try {
      const result = await source.fetchGroups(query, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      store.set({
        status: "idle",
        error: null,
        loaded: true,
        source: result.source,
        truncated: result.truncated,
        groups: sortGroups(def, query.group ?? "", result.groups).map(
          closedGroup,
        ),
      });
    } catch (error) {
      if (!isAbort(error)) {
        store.set({ ...store.get(), status: "error", error: toProblem(error) });
      }
    }
  };

  const openFeed = (value: string): Feed | null => {
    const known = feeds.get(value);
    if (known) {
      return known;
    }
    const groupQuery = getGroupQuery(query, value);
    const rows = createQueryStore(def, source.capabilities, groupQuery);
    if (rows.getQuery() !== groupQuery) {
      return null;
    }
    const feed = createFeed(rows, source, pageSize);
    feeds.set(value, feed);
    feed.subscribe(() => {
      const { rows: loaded, hasNext, status, error } = feed.getState();
      patchGroup(value, { rows: loaded, hasNext, status, error });
    });
    return feed;
  };

  return {
    getState: store.get,
    subscribe: (listener) => {
      readers += 1;
      if (readers === 1 && !store.get().loaded) {
        void load();
      }
      const unsubscribe = store.subscribe(listener);
      return () => {
        unsubscribe();
        readers -= 1;
        if (readers === 0) {
          pending?.abort();
        }
      };
    },
    toggle: (value) => {
      const group = store
        .get()
        .groups.find((item) => item.header.value === value);
      if (!group) {
        return;
      }
      if (group.expanded) {
        patchGroup(value, { expanded: false });
        return;
      }
      const feed = openFeed(value);
      if (!feed) {
        patchGroup(value, {
          expanded: true,
          status: "error",
          error: UNANSWERED,
        });
        return;
      }
      const { rows, hasNext, status, error } = feed.getState();
      patchGroup(value, { expanded: true, rows, hasNext, status, error });
    },
    loadMore: (value) => feeds.get(value)?.loadMore(),
  };
}
