"use client";

import {
  createRovingFocus,
  createTransfer,
  createVirtualizer,
  definePrimitive,
  type TransferDraft,
  type TransferLists,
  type Virtualizer,
} from "@ui-sdk/core";
import {
  usePart,
  usePrimitive,
  type PrimitiveHandle,
} from "@ui-sdk/react/primitive";
import { useEffect, useState } from "react";

import type { DataSource } from "../model/data-source.ts";
import {
  getField,
  type FieldDef,
  type GridDef,
  type GridFormat,
  type GridRow,
  type QueryMode,
  type QueryState,
} from "../model/field-types.ts";
import { formatCount, formatValue } from "../model/format.ts";
import { createQueryStore } from "../model/query-store.ts";
import { isAnswerable, isFacetCountShown } from "../model/shapes.ts";
import { createFeed, type Feed } from "../react/feed.ts";
import {
  useFacetState,
  useQueryGrid,
  useQueryState,
} from "../react/query-grid-provider.tsx";
import { useStoreValue } from "../react/use-store-value.ts";
import { FILL_COLUMN_STYLE, withData } from "./part-props.ts";
import { useVirtualItems } from "./use-virtual-items.ts";

const COLUMN_PAGE = 50;
const CARD_HEIGHT = 90;
const CARD_GAP = 8;
const CARD_EXTENT = CARD_HEIGHT + CARD_GAP;

interface BoardMove {
  id: string;
  from: string;
  to: string;
  index: number;
}

interface BoardSource {
  statusOf: (id: string) => string | null;
  allows: (from: string, to: string) => boolean;
  loadMore: (list: string) => void;
}

interface BoardOptions {
  source: BoardSource;
  onMove?: (move: BoardMove) => void;
}

interface KeptIndexes {
  ids: string[];
  moving: string | null;
  stop: string | null;
  indexes: number[];
}

interface DragWatch {
  key: string;
  y: number;
  started: boolean;
  dispose: () => void;
}

interface BoardState {
  lists: TransferLists;
  moving: TransferDraft | null;
  stop: string | null;
}

const board = definePrimitive({
  name: "query-grid-board",
  options: { source: "value", onMove: "callback" },
  state: (_options: BoardOptions): BoardState => ({
    lists: {},
    moving: null,
    stop: null,
  }),
  api: (context) => {
    const roving = createRovingFocus(context, { slot: "card", key: "stop" });
    const accepts = (key: string, list: string) => {
      const { source } = context.options();
      const from = source.statusOf(key);
      return from !== null && (from === list || source.allows(from, list));
    };
    const transfer = createTransfer(context, {
      key: "lists",
      draft: "moving",
      set: (value, details) => {
        if (details.from === details.to) {
          return false;
        }
        context.store.set({ lists: value });
        context.options().onMove?.({
          id: details.key,
          from: details.from,
          to: details.to,
          index: details.index,
        });
        return true;
      },
      accepts,
    });
    const idsOf = (list: string) =>
      transfer.lists(context.store.get())[list] ?? [];
    const virtuals = new Map<string, Virtualizer>();
    const virtualFor = (list: string): Virtualizer => {
      const existing = virtuals.get(list);
      if (existing) {
        return existing;
      }
      let kept: KeptIndexes = {
        ids: [],
        moving: null,
        stop: null,
        indexes: [],
      };
      const virtual = createVirtualizer({
        count: () => idsOf(list).length,
        estimate: () => CARD_EXTENT,
        key: (index) => idsOf(list)[index] ?? String(index),
        overscan: 4,
        endThreshold: 15,
        keep: () => {
          const state = context.store.get();
          const ids = idsOf(list);
          const moving = state.moving?.key ?? null;
          const fresh =
            kept.ids === ids &&
            kept.moving === moving &&
            kept.stop === state.stop;
          if (!fresh) {
            const indexes = [moving, state.stop].flatMap((key) => {
              const index = key ? ids.indexOf(key) : -1;
              return index < 0 ? [] : [index];
            });
            kept = { ids, moving, stop: state.stop, indexes };
          }
          return kept.indexes;
        },
        onEnd: () => context.options().source.loadMore(list),
      });
      virtuals.set(list, virtual);
      return virtual;
    };
    const revealMoving = () => {
      const moving = context.store.get().moving;
      if (!moving || moving.pointer) {
        return;
      }
      for (const [list, virtual] of virtuals) {
        const index = idsOf(list).indexOf(moving.key);
        if (index >= 0) {
          virtual.scrollToIndex(index);
        }
      }
    };

    const columns = new Map<string, HTMLElement>();
    const columnAt = (x: number) => {
      for (const [list, el] of columns) {
        const rect = el.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right) {
          return list;
        }
      }
      return null;
    };
    const listOf = (lists: TransferLists, key: string) =>
      Object.keys(lists).find((list) => lists[list].includes(key)) ?? null;
    const indexAt = (list: string, y: number) => {
      const el = columns.get(list);
      if (!el) {
        return 0;
      }
      const middle = CARD_GAP + CARD_HEIGHT / 2;
      const offset = y - el.getBoundingClientRect().top + el.scrollTop - middle;
      const index = Math.ceil(offset / CARD_EXTENT);
      return Math.max(0, Math.min(idsOf(list).length - 1, index));
    };

    let refreshed: Partial<BoardState> = {};
    const refreshChanged = () => {
      const state = context.store.get();
      const everyList =
        refreshed.moving !== state.moving || refreshed.stop !== state.stop;
      for (const [list, virtual] of virtuals) {
        if (everyList || refreshed.lists?.[list] !== state.lists[list]) {
          virtual.refresh();
        }
      }
      refreshed = state;
    };

    let watch: DragWatch | null = null;
    const placeDragged = () => {
      const moving = context.store.get().moving;
      if (!watch || !moving?.pointer || moving.key !== watch.key) {
        return;
      }
      watch.started = true;
      const list = listOf(moving.lists, moving.key);
      if (list === null) {
        return;
      }
      const index = indexAt(list, watch.y);
      if (moving.lists[list].indexOf(moving.key) !== index) {
        transfer.moveTo(list, index);
      }
    };
    const watchDrag = (event: PointerEvent, key: string) => {
      watch?.dispose();
      if (
        event.button !== 0 ||
        !event.isPrimary ||
        context.store.get().moving
      ) {
        return;
      }
      const pointerId = event.pointerId;
      const dispose = () => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", release, true);
        window.removeEventListener("pointercancel", release, true);
        watch = null;
      };
      const move = (moved: PointerEvent) => {
        if (watch && moved.pointerId === pointerId) {
          watch.y = moved.clientY;
        }
      };
      const release = (released: PointerEvent) => {
        if (released.pointerId !== pointerId) {
          return;
        }
        const moving = context.store.get().moving;
        const shown =
          moving?.pointer && moving.key === key
            ? listOf(moving.lists, key)
            : undefined;
        const elsewhere =
          shown !== undefined && columnAt(released.clientX) !== shown;
        if (released.type === "pointerup" && elsewhere) {
          transfer.cancel();
        }
        dispose();
      };
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", release, true);
      window.addEventListener("pointercancel", release, true);
      watch = { key, y: event.clientY, started: false, dispose };
    };

    context.onDestroy(
      context.store.subscribe(() => {
        placeDragged();
        if (watch?.started && !context.store.get().moving) {
          watch.dispose();
        }
        refreshChanged();
        revealMoving();
      }),
    );
    context.onDestroy(() => watch?.dispose());

    const bindColumn = (el: HTMLElement, list: string) => {
      columns.set(list, el);
      const cleanups = [
        transfer.bindList(el, list),
        virtualFor(list).connect(el),
      ];
      return () => {
        if (columns.get(list) === el) {
          columns.delete(list);
        }
        cleanups.forEach((cleanup) => cleanup());
      };
    };
    const setList = (list: string, ids: string[]) =>
      context.store.set({
        lists: { ...context.store.get().lists, [list]: ids },
      });
    return {
      roving,
      transfer,
      virtualFor,
      bindColumn,
      watchDrag,
      setList,
    };
  },
  slots: (slot) => ({
    column: slot<{ value: string }, { ids: string[] }>({
      props: { value: "string" },
      state: (state, { key, api }) => ({
        ids: api.transfer.lists(state)[key] ?? [],
      }),
      bind: (el, { api, key }) => api.bindColumn(el, key),
    }),
    card: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { key, props, api }) => ({
        tabindex: api.roving.tabIndex(state, { key, props }),
        "data-moving": api.transfer.moving(state, key) ? "" : undefined,
        "data-dragging": api.transfer.dragging(state, key) ? "" : undefined,
      }),
      on: {
        keydown: (event, { el, api, key }) => {
          if (!api.transfer.keydown(event, key) && el) {
            api.roving.keydown(event, el);
          }
        },
        pointerdown: (event, { api, key }) => {
          api.watchDrag(event, key);
          api.transfer.pointerdown(event, key);
        },
      },
      bind: (el, part) => {
        const cleanups = [
          part.api.roving.bind(el, part),
          part.api.transfer.bindItem(el, part.key),
        ];
        return () => cleanups.forEach((cleanup) => cleanup());
      },
    }),
  }),
});

type BoardHandle = PrimitiveHandle<typeof board>;

interface BoardData {
  feeds: Map<string, Feed>;
  subscribe: (listener: () => void) => () => void;
  getRows: () => Map<string, GridRow>;
}

function createBoardData(
  def: GridDef,
  source: DataSource,
  queries: Map<string, QueryState>,
): BoardData {
  const feeds = new Map(
    [...queries].map(([status, query]) => [
      status,
      createFeed(
        createQueryStore(def, query, "board", source.mode),
        source,
        COLUMN_PAGE,
      ),
    ]),
  );
  let rows: Map<string, GridRow> | null = null;
  return {
    feeds,
    subscribe: (listener) => {
      let seen = [...feeds.values()].map((feed) => feed.getState().rows);
      const changed = () => {
        const now = [...feeds.values()].map((feed) => feed.getState().rows);
        if (now.every((feedRows, index) => feedRows === seen[index])) {
          return;
        }
        seen = now;
        rows = null;
        listener();
      };
      const cleanups = [...feeds.values()].map((feed) =>
        feed.subscribe(changed),
      );
      return () => cleanups.forEach((cleanup) => cleanup());
    },
    getRows: () => {
      rows ??= new Map(
        [...feeds.values()].flatMap((feed) =>
          feed.getState().rows.map((row) => [row.id, row] as const),
        ),
      );
      return rows;
    },
  };
}

function listColumnQueries(
  def: GridDef,
  query: QueryState,
  mode: QueryMode,
): Map<string, QueryState> | null {
  const field = def.facet ? getField(def, def.facet.field) : null;
  if (!field?.options) {
    return null;
  }
  const selected = query.equals[field.key];
  const statuses = field.options
    .map((option) => option.value)
    .filter((value) => selected === undefined || value === selected);
  const base: QueryState =
    mode === "memory"
      ? { ...query, cursor: null }
      : { ...query, range: null, sort: def.defaultSort, cursor: null };
  const queries = new Map<string, QueryState>(
    statuses.map((status) => [
      status,
      { ...base, equals: { ...query.equals, [field.key]: status } },
    ]),
  );
  const combinable =
    mode === "memory" || (query.quick === null && query.range === null);
  const answerable =
    combinable &&
    [...queries.values()].every((column) => isAnswerable(def, column, mode));
  return answerable ? queries : null;
}

interface BoardCardBodyProps {
  row: GridRow | undefined;
  title: FieldDef;
  details: FieldDef[];
  format?: GridFormat;
}

function BoardCardBody({ row, title, details, format }: BoardCardBodyProps) {
  if (!row) {
    return null;
  }
  return (
    <>
      <div className="qg-board-card-title">
        {title.label} {formatValue(title, row[title.key] ?? null, format)}
      </div>
      {details.map((field) => (
        <div key={field.key} className="qg-board-card-detail">
          {formatValue(field, row[field.key] ?? null, format)}
        </div>
      ))}
    </>
  );
}

interface BoardCardProps extends BoardCardBodyProps {
  id: string;
  index: number;
  start: number;
}

function BoardCard({
  id,
  index,
  start,
  row,
  title,
  details,
  format,
}: BoardCardProps) {
  return usePart(
    board,
    "card",
    { value: id },
    withData(
      {
        role: "listitem",
        className: "qg-board-card",
        style: {
          position: "absolute" as const,
          top: 0,
          left: CARD_GAP,
          right: CARD_GAP,
          boxSizing: "border-box" as const,
          overflow: "hidden",
          height: CARD_HEIGHT,
          transform: `translateY(${start + CARD_GAP}px)`,
        },
        children: (
          <BoardCardBody
            row={row}
            title={title}
            details={details}
            format={format}
          />
        ),
      },
      { "data-card": id, "data-index": index },
    ),
    "div",
  );
}

interface ColumnCardsProps {
  ids: string[];
  virtual: Virtualizer;
  rows: Map<string, GridRow>;
  title: FieldDef;
  details: FieldDef[];
  format?: GridFormat;
}

function ColumnCards({
  ids,
  virtual,
  rows,
  title,
  details,
  format,
}: ColumnCardsProps) {
  const { items, size } = useVirtualItems(virtual);
  return (
    <div
      data-mounted={items.length}
      style={{ position: "relative", height: size + CARD_GAP }}
    >
      {items.flatMap((item) => {
        const id = ids[item.index];
        return id
          ? [
              <BoardCard
                key={id}
                id={id}
                index={item.index}
                start={item.start}
                row={rows.get(id)}
                title={title}
                details={details}
                format={format}
              />,
            ]
          : [];
      })}
    </div>
  );
}

interface BoardColumnProps {
  handle: BoardHandle;
  status: string;
  label: string;
  count: number | null;
  feed: Feed;
  rows: Map<string, GridRow>;
  title: FieldDef;
  details: FieldDef[];
  format?: GridFormat;
  syncVersion: number;
}

function BoardColumn({
  handle,
  status,
  label,
  count,
  feed,
  rows,
  title,
  details,
  format,
  syncVersion,
}: BoardColumnProps) {
  const feedState = useStoreValue(feed.subscribe, feed.getState);
  const [virtual] = useState(() => handle.api.virtualFor(status));
  const loadedRows = feedState.rows;

  useEffect(() => {
    handle.api.setList(
      status,
      loadedRows.map((row) => row.id),
    );
  }, [handle, status, loadedRows, syncVersion]);

  const list = usePart(
    handle,
    "column",
    { value: status },
    withData(
      {
        role: "list",
        "aria-label": label,
        className: "qg-board-list",
        style: { minHeight: 0, flex: "1 1 0%", overflowY: "auto" as const },
        children: (state: { ids: string[] }) => (
          <ColumnCards
            ids={state.ids}
            virtual={virtual}
            rows={rows}
            title={title}
            details={details}
            format={format}
          />
        ),
      },
      { "data-column": status, "data-loaded": loadedRows.length },
    ),
    "div",
  );

  return (
    <section
      className="qg-board-column"
      style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}
    >
      <header className="qg-board-column-head">
        <span>{label}</span>
        <span className="qg-board-column-count" data-column-count={status}>
          {count === null ? "" : formatCount(count, format)}
        </span>
      </header>
      {list}
    </section>
  );
}

interface StatusBoardProps {
  titleField: string;
  detailFields: string[];
}

interface BoardColumnsProps extends StatusBoardProps {
  queries: Map<string, QueryState>;
  showCounts: boolean;
  transitions: [string, string][];
}

function BoardColumns({
  queries,
  showCounts,
  transitions,
  titleField,
  detailFields,
}: BoardColumnsProps) {
  const { def, source, feed, facets, counts, totals } = useQueryGrid();
  const facetState = useFacetState();
  const [data] = useState(() => createBoardData(def, source, queries));
  const rows = useStoreValue(data.subscribe, data.getRows);
  const [error, setError] = useState<string | null>(null);
  const [syncVersion, setSyncVersion] = useState(0);
  const facetKey = def.facet?.field ?? "";
  const facetField = getField(def, facetKey);
  const title = getField(def, titleField);
  const details = detailFields.flatMap((key) => getField(def, key) ?? []);

  const onMove = async (move: BoardMove) => {
    try {
      const updated = await source.changeFacetValue(move.id, move.to);
      data.feeds.get(move.from)?.removeRow(move.id);
      data.feeds.get(move.to)?.insertRow(move.index, updated);
      feed.patchRow(move.id, updated);
      facets.reload();
      counts.reload();
      totals.reload();
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The move failed");
      setSyncVersion((version) => version + 1);
    }
  };

  const [boardSource] = useState<BoardSource>(() => ({
    statusOf: (id) => {
      const value = data.getRows().get(id)?.[facetKey];
      return typeof value === "string" ? value : null;
    },
    allows: (from, to) =>
      transitions.some(([start, end]) => start === from && end === to),
    loadMore: (list) => data.feeds.get(list)?.loadMore(),
  }));
  const handle = usePrimitive(board, { source: boardSource, onMove });

  if (!title) {
    return null;
  }
  const columns = [...data.feeds].map(([status, columnFeed]) => {
    const facet = facetState.counts.find((item) => item.value === status);
    const option = facetField?.options?.find((item) => item.value === status);
    return {
      status,
      feed: columnFeed,
      label: option?.label ?? status,
      count: showCounts && facet ? facet.count : null,
    };
  });
  return (
    <div
      className="qg-board"
      data-part="board"
      style={FILL_COLUMN_STYLE}
    >
      <p
        className="qg-board-message"
        data-board-message
        data-error={error ? "" : undefined}
      >
        {error ??
          "Drag a card, or press Space on it and use the arrow keys, to change its status. A column the card may not move to is skipped, and a drop outside the column it is shown in puts it back."}
      </p>
      <div
        className="qg-board-columns"
        style={{
          display: "flex",
          minHeight: 0,
          flex: "1 1 0%",
          overflowX: "auto",
        }}
      >
        {columns.map((column) => (
          <BoardColumn
            key={column.status}
            handle={handle}
            status={column.status}
            label={column.label}
            count={column.count}
            feed={column.feed}
            rows={rows}
            title={title}
            details={details}
            format={def.format}
            syncVersion={syncVersion}
          />
        ))}
      </div>
    </div>
  );
}

function useTransitions(source: DataSource): [string, string][] | null {
  const [transitions, setTransitions] = useState<[string, string][] | null>(
    null,
  );
  useEffect(() => {
    const controller = new AbortController();
    source
      .fetchTransitions(controller.signal)
      .then(setTransitions)
      .catch(() => undefined);
    return () => controller.abort();
  }, [source]);
  return transitions;
}

export function StatusBoard(props: StatusBoardProps) {
  const { def, source } = useQueryGrid();
  const query = useQueryState();
  const transitions = useTransitions(source);
  const queries = listColumnQueries(def, query, source.mode);
  if (!queries) {
    return (
      <p className="qg-notice" data-board-state="unavailable">
        No index answers the board with these filters. Clear the filters the
        board cannot combine with a status.
      </p>
    );
  }
  if (!transitions) {
    return (
      <p className="qg-notice" data-board-state="loading">
        Loading…
      </p>
    );
  }
  return (
    <BoardColumns
      key={JSON.stringify([...queries.values()])}
      queries={queries}
      showCounts={isFacetCountShown(def, query, source.mode)}
      transitions={transitions}
      {...props}
    />
  );
}
