"use client";

import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox";
import {
  usePart,
  usePrimitive,
  type PrimitiveHandle,
} from "@ui-sdk/react/primitive";
import { createContext, use, useEffect, useState, type ReactNode } from "react";

import {
  formatValue,
  type GridFormat,
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
import { HEADER_HEIGHT, sheet, type RowView } from "./grid-primitive.ts";
import { CheckIcon } from "./icons.tsx";
import { useMessages } from "./messages.tsx";
import { FILL_COLUMN_STYLE, withData } from "./part-props.ts";
import { useColumnState } from "./use-column-state.ts";
import { useVirtualItems } from "./use-virtual-items.ts";

type SheetHandle = PrimitiveHandle<typeof sheet>;
type Column = GridColumn<FieldDef>;

export interface DataGridProps extends RowWindow {
  fields: FieldDef[];
  capped?: boolean;
  format?: GridFormat;
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

interface DataGridContextValue {
  props: DataGridProps;
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
  format?: GridFormat;
}

function GridCells({ handle, view, row, columns, format }: GridCellsProps) {
  const messages = useMessages();
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
              <bdi>{formatValue(column.field, value, format)}</bdi>
            )}
          </div>
        );
      })}
    </>
  );
}

interface GridRowPartProps {
  handle: SheetHandle;
  index: number;
  start: number;
  row: GridRow;
  layout: GridLayout;
  format?: GridFormat;
}

function GridRowPart({
  handle,
  index,
  start,
  row,
  layout,
  format,
}: GridRowPartProps) {
  const [measure] = useState(
    () => (el: HTMLDivElement | null) => handle.api.virtual.measure(index, el),
  );
  return usePart(
    handle,
    "row",
    { row: index, id: String(index) },
    withData(
      {
        ref: measure,
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
            format={format}
          />
        ),
      },
      { "data-row": index, "data-row-id": row.id },
    ),
    "div",
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
                key={`${item.key}:${item.index}:${layout.layoutKey}`}
                handle={handle}
                index={item.index}
                start={item.start}
                row={row}
                layout={layout}
                format={props.format}
              />,
            ]
          : [];
      })}
    </div>
  );
}

function GridBody() {
  const { props } = useDataGrid();
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
  const { props } = useDataGrid();
  const messages = useMessages();
  if (props.loading) {
    return <bdi data-status="feed">{messages.feedLoading}</bdi>;
  }
  if (props.capped) {
    return <bdi data-status="feed">{messages.feedCapped}</bdi>;
  }
  if (!props.hasNext) {
    return <bdi data-status="feed">{messages.feedEnd}</bdi>;
  }
  return <span data-status="feed" />;
}

function SelectAll() {
  const { props, handle } = useDataGrid();
  const messages = useMessages();
  const loaded = props.rows.length;
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
  const { fields, rows, format, resetKey } = props;
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
    format,
    onEndReached: props.onEndReached,
  });
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    handle.api.virtual.refresh();
  }, [handle, rows, layout.layoutKey]);

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
        value={{ props, handle, state, update, layout, setScroller }}
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
  const { props, handle } = useDataGrid();
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
                rows={props.rows}
                loading={props.loading}
                pages={props.pages}
                format={props.format}
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
