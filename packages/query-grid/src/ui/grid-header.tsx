"use client";

import {
  bindDrag,
  createReorder,
  createRovingFocus,
  definePrimitive,
  dragThreshold,
  type ReorderDraft,
} from "@ui-sdk/core";
import { Button } from "@ui-sdk/react/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/react/popover";
import { usePart, usePrimitive } from "@ui-sdk/react/primitive";
import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import {
  beginResize,
  cancelResize,
  COLUMN_MAX_WIDTH,
  COLUMN_MIN_WIDTH,
  resizeWidth,
  stepWidth,
  type ColumnStore,
  type GridColumn,
  type ResizeSession,
} from "../model/column-state.ts";
import type { FieldDef, SortDirection } from "../model/field-types.ts";
import type { Offers } from "../model/query-actions.ts";
import {
  useOffers,
  useQueryDispatch,
  useQueryState,
} from "../react/query-grid-provider.tsx";
import { FieldFilter } from "./field-filter.tsx";
import { HEADER_HEIGHT } from "./grid-primitive.ts";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  FilterIcon,
} from "./icons.tsx";
import { withData } from "./part-props.ts";

export const SELECT_COLUMN_WIDTH = 40;

interface HeaderOptions {
  order: string[];
  onOrderChange?: (order: string[]) => void;
}

interface HeaderState {
  value: string[];
  moving: ReorderDraft | null;
  stop: string | null;
}

const headerRow = definePrimitive({
  name: "query-grid-header",
  options: { order: "list", onOrderChange: "callback" },
  state: (options: HeaderOptions): HeaderState => ({
    value: options.order,
    moving: null,
    stop: null,
  }),
  api: (context) => {
    const roving = createRovingFocus(context, {
      slot: "column",
      key: "stop",
      orientation: () => "horizontal",
    });
    const reorder = createReorder(context, {
      slot: "column",
      key: "value",
      draft: "moving",
      set: (value) => {
        context.store.set({ value });
        context.options().onOrderChange?.(value);
        return true;
      },
      orientation: () => "horizontal",
    });
    context.onOptions((options) => {
      const { value, moving } = context.store.get();
      const same =
        options.order.length === value.length &&
        options.order.every((key, index) => key === value[index]);
      if (!moving && !same) {
        context.store.set({ value: options.order });
      }
    });
    return { roving, reorder };
  },
  slots: (slot) => ({
    root: slot<object, { order: string[] }>({
      state: (state, { api }) => ({ order: api.reorder.order(state) }),
    }),
    column: slot<{ value: string }>({
      props: { value: "string" },
      role: "columnheader",
      attrs: (state, { key, props, api }) => ({
        tabindex: api.roving.tabIndex(state, { key, props }),
        "data-dragging": api.reorder.dragging(state, key) ? "" : undefined,
        "data-moving": api.reorder.moving(state, key) ? "" : undefined,
      }),
      on: {
        keydown: (event, { el, api, key }) => {
          if (!el || event.target !== el) {
            return;
          }
          if (!api.reorder.keydown(event, key)) {
            api.roving.keydown(event, el);
          }
        },
        pointerdown: (event, { api, key }) => {
          const onControl =
            event.target instanceof Element &&
            event.target.closest("[data-no-drag]") !== null;
          if (!onControl) {
            api.reorder.pointerdown(event, key);
          }
        },
      },
      bind: (el, part) => {
        const reveal = () => {
          const moving = part.store.get().moving;
          if (moving && !moving.pointer && moving.key === part.key) {
            requestAnimationFrame(() =>
              el.scrollIntoView({ block: "nearest", inline: "center" }),
            );
          }
        };
        const cleanups = [
          part.api.roving.bind(el, part),
          part.api.reorder.bind(el, part),
          part.store.subscribe(reveal),
        ];
        return () => cleanups.forEach((cleanup) => cleanup());
      },
    }),
  }),
});

function isFilterOffered(field: FieldDef, offers: Offers): boolean {
  return offers.equals.includes(field.key) || offers.ranges.includes(field.key);
}

function SortIcon({ direction }: { direction: SortDirection | null }) {
  if (direction === "asc") {
    return <ArrowUpIcon />;
  }
  if (direction === "desc") {
    return <ArrowDownIcon />;
  }
  return <ArrowUpDownIcon />;
}

function HeaderLabel({ field }: { field: FieldDef }) {
  const query = useQueryState();
  const offers = useOffers();
  const dispatch = useQueryDispatch();
  if (!offers.sorts.includes(field.key)) {
    return <span className="qg-header-label">{field.label}</span>;
  }
  const direction =
    query.sort.field === field.key ? query.sort.direction : null;
  return (
    <Button
      className="qg-header-sort"
      data-no-drag
      data-header-sort={field.key}
      data-sorted={direction ?? undefined}
      aria-label={`Sort by ${field.label}`}
      onClick={() =>
        dispatch({
          type: "setSort",
          field: field.key,
          direction: direction === "desc" ? "asc" : "desc",
        })
      }
    >
      <span className="qg-header-label">{field.label}</span>
      <SortIcon direction={direction} />
    </Button>
  );
}

function HeaderFilter({ field }: { field: FieldDef }) {
  const query = useQueryState();
  const offers = useOffers();
  if (!isFilterOffered(field, offers)) {
    return null;
  }
  const active = field.key in query.equals || query.range?.field === field.key;
  return (
    <span data-no-drag data-header-filter={field.key}>
      <Popover>
        <PopoverTrigger
          className="qg-header-filter"
          aria-label={`Filter ${field.label}`}
          data-active={active ? "" : undefined}
        >
          <FilterIcon />
        </PopoverTrigger>
        <PopoverContent className="qg-popup qg-popover" align="start">
          <PopoverTitle className="qg-popover-title">
            Filter {field.label}
          </PopoverTitle>
          <FieldFilter field={field} />
        </PopoverContent>
      </Popover>
    </span>
  );
}

interface HeaderCellProps {
  column: GridColumn;
  store: ColumnStore;
}

function ResizeHandle({ column, store }: HeaderCellProps) {
  const stop = useRef<(() => void) | null>(null);
  const keys = useRef<ResizeSession | null>(null);
  const key = column.field.key;
  useEffect(() => () => stop.current?.(), []);
  const startDrag = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) {
      return;
    }
    const session = beginResize(key, column.width);
    const originX = event.clientX;
    stop.current?.();
    stop.current = bindDrag(event.currentTarget, event.nativeEvent, {
      threshold: dragThreshold,
      cancelOnEscape: true,
      onMove: ({ x }) => store.resize(key, resizeWidth(session, x - originX)),
      onEnd: (_event, canceled) => {
        if (canceled) {
          store.resize(key, cancelResize(session));
        }
      },
    });
  };
  const stepByKey = (event: ReactKeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Escape" && keys.current) {
      store.resize(key, cancelResize(keys.current));
      keys.current = null;
      return;
    }
    const next = stepWidth(column.width, event.key, event.shiftKey);
    if (next === column.width) {
      return;
    }
    event.preventDefault();
    keys.current ??= beginResize(key, column.width);
    store.resize(key, next);
  };
  return (
    <span
      className="qg-resize-handle"
      data-no-drag
      data-resize={key}
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={`Resize ${column.field.label}`}
      aria-valuenow={column.width}
      aria-valuemin={COLUMN_MIN_WIDTH}
      aria-valuemax={COLUMN_MAX_WIDTH}
      style={{ touchAction: "none" }}
      onPointerDown={startDrag}
      onKeyDown={stepByKey}
      onBlur={() => {
        keys.current = null;
      }}
    />
  );
}

function HeaderCellContent({ column, store }: HeaderCellProps) {
  return (
    <>
      <HeaderLabel field={column.field} />
      <HeaderFilter field={column.field} />
      <ResizeHandle column={column} store={store} />
    </>
  );
}

function cellStyle(column: GridColumn): CSSProperties {
  return {
    position: "relative",
    display: "flex",
    flexShrink: 0,
    boxSizing: "border-box",
    width: column.width,
  };
}

function PinnedHeaderCell({ column, store }: HeaderCellProps) {
  return (
    <div
      className="qg-header-cell"
      role="columnheader"
      data-header={column.field.key}
      data-pinned=""
      style={{
        ...cellStyle(column),
        position: "sticky",
        zIndex: 3,
        left: SELECT_COLUMN_WIDTH + column.left,
      }}
    >
      <HeaderCellContent column={column} store={store} />
    </div>
  );
}

function ReorderHeaderCell({ column, store }: HeaderCellProps) {
  return usePart(
    headerRow,
    "column",
    { value: column.field.key },
    withData(
      {
        className: "qg-header-cell qg-header-cell-movable",
        style: {
          ...cellStyle(column),
          transform: "translateX(var(--drag-x, 0px))",
        },
        children: <HeaderCellContent column={column} store={store} />,
      },
      { "data-header": column.field.key },
    ),
    "div",
  );
}

interface ReorderHeadersProps {
  columns: GridColumn[];
  store: ColumnStore;
}

function ReorderHeaders({ columns, store }: ReorderHeadersProps) {
  const handle = usePrimitive(headerRow, {
    order: columns.map((column) => column.field.key),
    onOrderChange: store.setOrder,
  });
  return usePart(
    handle,
    "root",
    {},
    withData(
      {
        style: { display: "flex" },
        children: (state: { order: string[] }) =>
          state.order.flatMap((key) => {
            const column = columns.find((item) => item.field.key === key);
            return column
              ? [<ReorderHeaderCell key={key} column={column} store={store} />]
              : [];
          }),
      },
      { "data-part": "grid-header-reorder" },
    ),
    "div",
  );
}

interface GridHeaderProps {
  columns: GridColumn[];
  store: ColumnStore;
  totalWidth: number;
  selectAll: ReactNode;
}

export function GridHeader({
  columns,
  store,
  totalWidth,
  selectAll,
}: GridHeaderProps) {
  const pinned = columns.filter((column) => column.pinned);
  const center = columns.filter((column) => !column.pinned);
  return (
    <div
      className="qg-header-row"
      role="row"
      data-part="grid-header"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 4,
        display: "flex",
        height: HEADER_HEIGHT,
        width: SELECT_COLUMN_WIDTH + totalWidth,
      }}
    >
      <div
        className="qg-header-cell qg-select-cell"
        role="columnheader"
        style={{
          position: "sticky",
          left: 0,
          zIndex: 3,
          display: "flex",
          flexShrink: 0,
          boxSizing: "border-box",
          width: SELECT_COLUMN_WIDTH,
        }}
      >
        {selectAll}
      </div>
      {pinned.map((column) => (
        <PinnedHeaderCell
          key={column.field.key}
          column={column}
          store={store}
        />
      ))}
      <ReorderHeaders columns={center} store={store} />
    </div>
  );
}
