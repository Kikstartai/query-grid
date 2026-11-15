"use client";

import { Button } from "@ui-sdk/react/button";
import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox";
import {
  usePart,
  usePrimitive,
  type PrimitiveHandle,
} from "@ui-sdk/react/primitive";
import { createContext, use, useEffect, useState, type ReactNode } from "react";

import {
  formatValue,
  type GridRow,
  type SortDirection,
  type SortState,
} from "@kikstart/query-grid";

import {
  clampWidth,
  layoutColumns,
  patchColumn,
  reorderColumns,
  type ColumnPersistence,
  type ColumnState,
  type ColumnUpdate,
  type GridColumn,
} from "./column-state.ts";
import { ColumnsMenu } from "./columns-menu.tsx";
import { FeedNotice, isWindowBlank, LoadedText } from "./feed-notice.tsx";
import type { FieldDef, RowWindow } from "./fields.ts";
import {
  GridHeader,
  SELECT_COLUMN_WIDTH,
  type HeaderControls,
} from "./grid-header.tsx";
import {
  HEADER_HEIGHT,
  sheet,
  type RowView,
  type SheetLayout,
} from "./grid-primitive.ts";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from "./icons.tsx";
import { useLocale, useMessages } from "./messages.tsx";
import { FILL_COLUMN_STYLE, withData } from "./part-props.ts";
import { useColumnState } from "./use-column-state.ts";
import { useVirtualItems } from "./use-virtual-items.ts";

type SheetHandle = PrimitiveHandle<typeof sheet>;
type Column = GridColumn<FieldDef>;

export interface GridGroup {
  key: string;
  label: string;
  count: string;
  detail?: string | null;
  expanded: boolean;
  rows: GridRow[];
  hasNext: boolean;
  loading: boolean;
  error?: string | null;
}

export interface DataGridProps extends RowWindow {
  fields: FieldDef[];
  groups?: GridGroup[];
  onGroupToggle?: (key: string) => void;
  onGroupLoadMore?: (key: string) => void;
  capped?: boolean;
  resetKey?: unknown;
  columns?: ColumnState[];
  onColumnsChange?: (columns: ColumnState[]) => void;
  columnPersistence?: ColumnPersistence;
  sort?: SortState | null;
  sortableFields?: string[];
  onSortChange?: (field: string, direction: SortDirection) => void;
  filters?: Record<string, ReactNode>;
  activeFilters?: string[];
}

export interface DataGridRootProps extends DataGridProps {
  children: ReactNode;
}

export interface DataGridToolbarProps {
  children: ReactNode;
}

interface GridLayout {
  columns: Column[];
  totalWidth: number;
  pinnedWidth: number;
  layoutKey: string;
}

type GridEntry =
  | { kind: "row"; key: string; row: number }
  | { kind: "group"; key: string; group: GridGroup }
  | { kind: "more"; key: string; group: GridGroup };

interface GroupedRows {
  rows: GridRow[];
  entries: GridEntry[];
  layout: SheetLayout;
}

function needsMoreRow(group: GridGroup): boolean {
  return group.hasNext || group.loading || Boolean(group.error);
}

function layoutGroups(groups: GridGroup[]): GroupedRows {
  const rows: GridRow[] = [];
  const entries: GridEntry[] = [];
  const rowItems: number[] = [];
  for (const group of groups) {
    entries.push({ kind: "group", key: `group:${group.key}`, group });
    if (!group.expanded) {
      continue;
    }
    for (const row of group.rows) {
      rowItems.push(entries.length);
      entries.push({ kind: "row", key: row.id, row: rows.length });
      rows.push(row);
    }
    if (needsMoreRow(group)) {
      entries.push({ kind: "more", key: `more:${group.key}`, group });
    }
  }
  return {
    rows,
    entries,
    layout: { keys: entries.map((entry) => entry.key), rowItems },
  };
}

interface DataGridContextValue {
  props: DataGridProps;
  rows: GridRow[];
  entries: GridEntry[] | null;
  handle: SheetHandle;
  state: ColumnState[];
  update: (change: ColumnUpdate) => void;
  layout: GridLayout;
  setScroller: (element: HTMLDivElement | null) => void;
}

const DataGridContext = createContext<DataGridContextValue | null>(null);

function useDataGrid(): DataGridContextValue {
  const value = use(DataGridContext);
  if (!value) {
    throw new Error("A DataGrid part needs a DataGrid.Root above it");
  }
  return value;
}

function sumWidths(columns: Column[]): number {
  return columns.reduce((sum, column) => sum + column.width, 0);
}

interface GridCellsProps {
  handle: SheetHandle;
  view: RowView;
  row: GridRow;
  columns: Column[];
}

function GridCells({ handle, view, row, columns }: GridCellsProps) {
  const messages = useMessages();
  const locale = useLocale();
  return (
    <>
      <div
        className="qg-cell qg-select-cell"
        style={{
          position: "sticky",
          insetInlineStart: 0,
          zIndex: 1,
          display: "flex",
          flexShrink: 0,
          boxSizing: "border-box",
          width: SELECT_COLUMN_WIDTH,
        }}
      >
        <span
          className="qg-row-check"
          role="checkbox"
          aria-label={messages.selectRow}
          aria-checked={view.selected}
          data-select-row={row.id}
          data-checked={view.selected ? "" : undefined}
          tabIndex={0}
          onClick={(event) => handle.api.pressRow(row.id, event.nativeEvent)}
          onKeyDown={(event) => {
            if (event.key === " " || event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              handle.api.pressRow(row.id, event.nativeEvent);
            }
          }}
        >
          <CheckIcon size={12} />
        </span>
      </div>
      {columns.map((column, col) => {
        const cell = view.cells[col];
        const value = row[column.field.key] ?? null;
        return (
          <div
            key={column.field.key}
            className="qg-cell"
            role="gridcell"
            data-col={col}
            data-field={column.field.key}
            data-type={column.field.type}
            data-wrap={column.field.wrap ? "" : undefined}
            data-active={cell?.active ? "" : undefined}
            data-selected={cell?.selected ? "" : undefined}
            data-pinned={column.pinned ? "" : undefined}
            aria-selected={cell?.selected ?? false}
            tabIndex={cell?.tabIndex ?? -1}
            style={{
              flexShrink: 0,
              boxSizing: "border-box",
              width: column.width,
              position: column.pinned ? "sticky" : undefined,
              zIndex: column.pinned ? 1 : undefined,
              insetInlineStart: column.pinned
                ? SELECT_COLUMN_WIDTH + column.start
                : undefined,
            }}
          >
            {column.field.cell ? (
              column.field.cell(value, row)
            ) : (
              <bdi>{formatValue(column.field, value, locale)}</bdi>
            )}
          </div>
        );
      })}
    </>
  );
}

interface GridRowPartProps {
  handle: SheetHandle;
  item: number;
  index: number;
  start: number;
  row: GridRow;
  layout: GridLayout;
}

function GridRowPart({
  handle,
  item,
  index,
  start,
  row,
  layout,
}: GridRowPartProps) {
  return usePart(
    handle,
    "row",
    { row: index, id: String(index) },
    withData(
      {
        ref: (el: HTMLDivElement | null) =>
          handle.api.virtual.measure(item, el),
        className: "qg-row",
        style: {
          position: "absolute" as const,
          top: 0,
          insetInlineStart: 0,
          display: "flex",
          transform: `translateY(${start}px)`,
          width: SELECT_COLUMN_WIDTH + layout.totalWidth,
        },
        children: (view: RowView) => (
          <GridCells
            handle={handle}
            view={view}
            row={row}
            columns={layout.columns}
          />
        ),
      },
      { "data-row": index, "data-row-id": row.id },
    ),
    "div",
  );
}

interface GroupRowProps {
  handle: SheetHandle;
  item: number;
  start: number;
  group: GridGroup;
  layout: GridLayout;
}

function groupRowStyle(start: number, layout: GridLayout) {
  return {
    position: "absolute" as const,
    top: 0,
    insetInlineStart: 0,
    display: "flex",
    transform: `translateY(${start}px)`,
    width: SELECT_COLUMN_WIDTH + layout.totalWidth,
  };
}

const GROUP_CELL_STYLE = {
  position: "sticky" as const,
  insetInlineStart: 0,
  display: "flex",
  alignItems: "center",
};

function GroupChevron({ expanded }: { expanded: boolean }) {
  if (expanded) {
    return <ChevronDownIcon />;
  }
  return (
    <span className="qg-group-chevron">
      <ChevronRightIcon />
    </span>
  );
}

function GroupDetail({ detail }: { detail?: string | null }) {
  if (!detail) {
    return null;
  }
  return <bdi className="qg-group-detail">{detail}</bdi>;
}

function GroupHeaderRow({ handle, item, start, group, layout }: GroupRowProps) {
  const { props } = useDataGrid();
  const messages = useMessages();
  return (
    <div
      ref={(el) => handle.api.virtual.measure(item, el)}
      className="qg-group-row"
      role="row"
      data-group={group.key}
      data-expanded={group.expanded ? "" : undefined}
      style={groupRowStyle(start, layout)}
    >
      <div
        className="qg-group-cell"
        role="gridcell"
        aria-colspan={layout.columns.length + 1}
        style={GROUP_CELL_STYLE}
      >
        <Button
          className="qg-group-toggle"
          aria-expanded={group.expanded}
          aria-label={messages.groupToggle({ label: group.label })}
          data-group-toggle={group.key}
          onClick={() => props.onGroupToggle?.(group.key)}
        >
          <GroupChevron expanded={group.expanded} />
          <bdi className="qg-group-label">{group.label}</bdi>
        </Button>
        <bdi className="qg-group-count" data-group-count={group.key}>
          {group.count}
        </bdi>
        <GroupDetail detail={group.detail} />
      </div>
    </div>
  );
}

function GroupMoreContent({ group }: { group: GridGroup }) {
  const { props } = useDataGrid();
  const messages = useMessages();
  if (group.error) {
    return (
      <bdi className="qg-notice-error" data-group-error={group.key}>
        {group.error}
      </bdi>
    );
  }
  if (group.loading) {
    return <bdi data-group-loading={group.key}>{messages.feedLoading}</bdi>;
  }
  return (
    <Button
      data-group-more={group.key}
      onClick={() => props.onGroupLoadMore?.(group.key)}
    >
      {messages.groupLoadMore}
    </Button>
  );
}

function GroupMoreRow({ handle, item, start, group, layout }: GroupRowProps) {
  return (
    <div
      ref={(el) => handle.api.virtual.measure(item, el)}
      className="qg-group-more"
      role="row"
      style={groupRowStyle(start, layout)}
    >
      <div
        className="qg-group-cell"
        role="gridcell"
        aria-colspan={layout.columns.length + 1}
        style={GROUP_CELL_STYLE}
      >
        <GroupMoreContent group={group} />
      </div>
    </div>
  );
}

interface GridEntryRowProps {
  entry: GridEntry;
  item: number;
  start: number;
}

function GridEntryRow({ entry, item, start }: GridEntryRowProps) {
  const { rows, handle, layout } = useDataGrid();
  if (entry.kind === "group") {
    return (
      <GroupHeaderRow
        handle={handle}
        item={item}
        start={start}
        group={entry.group}
        layout={layout}
      />
    );
  }
  if (entry.kind === "more") {
    return (
      <GroupMoreRow
        handle={handle}
        item={item}
        start={start}
        group={entry.group}
        layout={layout}
      />
    );
  }
  const row = rows[entry.row];
  if (!row) {
    return null;
  }
  return (
    <GridRowPart
      handle={handle}
      item={item}
      index={entry.row}
      start={start}
      row={row}
      layout={layout}
    />
  );
}

function GroupedRows() {
  const { entries, handle, layout } = useDataGrid();
  const { items, size } = useVirtualItems(handle.api.virtual);
  return (
    <div
      className="qg-rows"
      role="rowgroup"
      data-part="grid-rows"
      data-grouped=""
      data-mounted={items.length}
      style={{
        position: "relative",
        height: size,
        width: SELECT_COLUMN_WIDTH + layout.totalWidth,
      }}
    >
      {items.flatMap((item) => {
        const entry = entries?.[item.index];
        return entry
          ? [
              <GridEntryRow
                key={`${item.key}:${layout.layoutKey}`}
                entry={entry}
                item={item.index}
                start={item.start}
              />,
            ]
          : [];
      })}
    </div>
  );
}

function GridRows() {
  const { props, handle, layout } = useDataGrid();
  const { items, size } = useVirtualItems(handle.api.virtual);
  return (
    <div
      className="qg-rows"
      role="rowgroup"
      data-part="grid-rows"
      data-mounted={items.length}
      style={{
        position: "relative",
        height: size,
        width: SELECT_COLUMN_WIDTH + layout.totalWidth,
      }}
    >
      {items.flatMap((item) => {
        const row = props.rows[item.index];
        return row
          ? [
              <GridRowPart
                key={`${item.key}:${layout.layoutKey}`}
                handle={handle}
                item={item.index}
                index={item.index}
                start={item.start}
                row={row}
                layout={layout}
              />,
            ]
          : [];
      })}
    </div>
  );
}

function GridBody() {
  const { props, entries } = useDataGrid();
  if (entries) {
    if (props.error || entries.length === 0) {
      return <FeedNotice {...props} />;
    }
    return <GroupedRows />;
  }
  if (isWindowBlank(props)) {
    return <FeedNotice {...props} />;
  }
  return <GridRows />;
}

interface SheetStatus {
  active: string;
  range: string;
  selectedCount: number;
  copied: string;
}

function FeedProgress() {
  const { props, entries } = useDataGrid();
  const messages = useMessages();
  if (props.loading) {
    return <bdi data-status="feed">{messages.feedLoading}</bdi>;
  }
  if (props.capped) {
    return <bdi data-status="feed">{messages.feedCapped}</bdi>;
  }
  if (!props.hasNext && !entries) {
    return <bdi data-status="feed">{messages.feedEnd}</bdi>;
  }
  return <span data-status="feed" />;
}

function SelectAll() {
  const { rows, handle } = useDataGrid();
  const messages = useMessages();
  const loaded = rows.length;
  return usePart(
    handle,
    "status",
    { id: "select-all" },
    {
      children: (status: SheetStatus) => (
        <Checkbox
          aria-label={messages.selectAll}
          data-select-all
          checked={loaded > 0 && status.selectedCount === loaded}
          onCheckedChange={handle.api.toggleAll}
        >
          <CheckboxIndicator />
        </Checkbox>
      ),
    },
    "span",
  );
}

function DataGridRoot({ children, ...props }: DataGridRootProps) {
  const { fields, resetKey } = props;
  const grouped = props.groups ? layoutGroups(props.groups) : null;
  const rows = grouped?.rows ?? props.rows;
  const locale = useLocale();
  const { columns: state, update } = useColumnState(props);
  const columns = layoutColumns(fields, state);
  const [seenKey, setSeenKey] = useState(resetKey);
  const [epoch, setEpoch] = useState(0);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setEpoch(epoch + 1);
  }
  const layout: GridLayout = {
    columns,
    totalWidth: sumWidths(columns),
    pinnedWidth: sumWidths(columns.filter((column) => column.pinned)),
    layoutKey: `${epoch}:${columns.map((column) => column.field.key).join(",")}`,
  };
  const handle = usePrimitive(sheet, {
    rows,
    columns: columns.map((column) => column.field),
    locale,
    layout: grouped?.layout ?? null,
    onEndReached: props.onEndReached,
  });
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);

  const entryCount = grouped?.entries.length ?? rows.length;

  useEffect(() => {
    handle.api.virtual.refresh();
  }, [handle, rows, entryCount, layout.layoutKey]);

  useEffect(() => {
    if (epoch === 0) {
      return;
    }
    handle.api.clear();
    scroller?.scrollTo({ top: 0 });
  }, [epoch, handle, scroller]);

  return (
    <div className="qg-grid" data-part="grid" style={FILL_COLUMN_STYLE}>
      <DataGridContext
        value={{
          props,
          rows,
          entries: grouped?.entries ?? null,
          handle,
          state,
          update,
          layout,
          setScroller,
        }}
      >
        {children}
      </DataGridContext>
    </div>
  );
}

function DataGridToolbar({ children }: DataGridToolbarProps) {
  return <div className="qg-grid-toolbar">{children}</div>;
}

function DataGridStatus() {
  const { props, rows, handle } = useDataGrid();
  const messages = useMessages();
  const none = (value: string) => (value === "none" ? messages.none : value);
  return usePart(
    handle,
    "status",
    {},
    withData(
      {
        className: "qg-status",
        children: (status: SheetStatus) => (
          <>
            <span className="qg-status-feed">
              <LoadedText
                rows={rows}
                loading={props.loading}
                pages={props.pages}
              />
              <FeedProgress />
            </span>
            <span className="qg-status-sheet">
              <bdi data-status="selected" data-value={status.selectedCount}>
                {messages.selected({ count: status.selectedCount })}
              </bdi>
              <bdi data-status="active" data-value={status.active}>
                {messages.activeCell({ cell: none(status.active) })}
              </bdi>
              <bdi data-status="range" data-value={status.range}>
                {messages.cellRange({ range: none(status.range) })}
              </bdi>
            </span>
            <pre data-status="copied" hidden>
              {status.copied}
            </pre>
          </>
        ),
      },
      { "data-part": "grid-status" },
    ),
    "div",
  );
}

function DataGridColumnsMenu() {
  const { props, state, update } = useDataGrid();
  return (
    <ColumnsMenu
      fields={props.fields}
      columns={state}
      onColumnsChange={(next) => update(() => next)}
    />
  );
}

function DataGridBody() {
  const { props, handle, update, layout, setScroller } = useDataGrid();
  const controls: HeaderControls = {
    sort: props.sort,
    sortableFields: props.sortableFields,
    onSortChange: props.onSortChange,
    filters: props.filters,
    activeFilters: props.activeFilters,
    onResize: (key, width) =>
      update((current) =>
        patchColumn(current, key, { width: clampWidth(width) }),
      ),
    onReorder: (keys) => update((current) => reorderColumns(current, keys)),
  };
  return usePart(
    handle,
    "root",
    {},
    withData(
      {
        ref: setScroller,
        className: "qg-grid-scroller",
        style: {
          position: "relative" as const,
          overflow: "auto",
          minHeight: 0,
          flex: "1 1 0%",
          scrollPaddingTop: HEADER_HEIGHT,
          scrollPaddingInlineStart: SELECT_COLUMN_WIDTH + layout.pinnedWidth,
        },
        children: (
          <>
            <GridHeader
              columns={layout.columns}
              controls={controls}
              totalWidth={layout.totalWidth}
              selectAll={<SelectAll />}
            />
            <GridBody />
          </>
        ),
      },
      { "data-part": "grid-scroller" },
    ),
    "div",
  );
}

export function DataGridDefaultParts() {
  return (
    <>
      <DataGridToolbar>
        <DataGridStatus />
        <DataGridColumnsMenu />
      </DataGridToolbar>
      <DataGridBody />
    </>
  );
}

function DefaultDataGrid(props: DataGridProps) {
  return (
    <DataGridRoot {...props}>
      <DataGridDefaultParts />
    </DataGridRoot>
  );
}

export const DataGrid = Object.assign(DefaultDataGrid, {
  Root: DataGridRoot,
  Toolbar: DataGridToolbar,
  Status: DataGridStatus,
  ColumnsMenu: DataGridColumnsMenu,
  Body: DataGridBody,
});
