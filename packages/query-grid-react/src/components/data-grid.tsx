"use client";

import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox";
import {
  usePart,
  usePrimitive,
  type PrimitiveHandle,
} from "@ui-sdk/react/primitive";
import { useEffect, useState, type ReactNode } from "react";

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
  type GridColumn,
} from "./column-state.ts";
import { ColumnsMenu } from "./columns-menu.tsx";
import { FeedNotice, isWindowBlank } from "./feed-notice.tsx";
import type { ClientFieldDef, RowWindow } from "./fields.ts";
import {
  GridHeader,
  SELECT_COLUMN_WIDTH,
  type HeaderControls,
} from "./grid-header.tsx";
import { HEADER_HEIGHT, sheet, type RowView } from "./grid-primitive.ts";
import { CheckIcon } from "./icons.tsx";
import { formatLoaded, useMessages } from "./messages.tsx";
import { FILL_COLUMN_STYLE, withData } from "./part-props.ts";
import { useColumnState } from "./use-column-state.ts";
import { useVirtualItems } from "./use-virtual-items.ts";

type SheetHandle = PrimitiveHandle<typeof sheet>;
type Column = GridColumn<ClientFieldDef>;

export interface DataGridProps extends RowWindow {
  fields: ClientFieldDef[];
  capped?: boolean;
  format?: GridFormat;
  resetKey?: unknown;
  columns?: ColumnState[];
  onColumnsChange?: (columns: ColumnState[]) => void;
  columnPersistence?: ColumnPersistence | null;
  sort?: SortState | null;
  sortableFields?: string[];
  onSortChange?: (field: string, direction: SortDirection) => void;
  filters?: Record<string, ReactNode>;
  activeFilters?: string[];
}

interface GridLayout {
  columns: Column[];
  totalWidth: number;
  pinnedWidth: number;
  layoutKey: string;
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

interface GridRowsProps {
  handle: SheetHandle;
  layout: GridLayout;
  rows: GridRow[];
  format?: GridFormat;
}

function GridRows({ handle, layout, rows, format }: GridRowsProps) {
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
        const row = rows[item.index];
        return row
          ? [
              <GridRowPart
                key={`${item.key}:${item.index}:${layout.layoutKey}`}
                handle={handle}
                index={item.index}
                start={item.start}
                row={row}
                layout={layout}
                format={format}
              />,
            ]
          : [];
      })}
    </div>
  );
}

interface GridBodyProps extends GridRowsProps {
  rowWindow: RowWindow;
}

function GridBody({ rowWindow, ...rows }: GridBodyProps) {
  if (isWindowBlank(rowWindow)) {
    return <FeedNotice {...rowWindow} />;
  }
  return <GridRows {...rows} />;
}

interface SheetStatus {
  active: string;
  range: string;
  selectedCount: number;
  copied: string;
}

type ProgressProps = Pick<DataGridProps, "loading" | "capped" | "hasNext">;

function FeedProgress({ loading, capped, hasNext }: ProgressProps) {
  const messages = useMessages();
  if (loading) {
    return <bdi data-status="feed">{messages.feedLoading}</bdi>;
  }
  if (capped) {
    return <bdi data-status="feed">{messages.feedCapped}</bdi>;
  }
  if (!hasNext) {
    return <bdi data-status="feed">{messages.feedEnd}</bdi>;
  }
  return <span data-status="feed" />;
}

interface GridStatusProps extends ProgressProps {
  handle: SheetHandle;
  loaded: number;
  pages?: number;
  format?: GridFormat;
}

function GridStatus({
  handle,
  loaded,
  pages,
  format,
  ...progress
}: GridStatusProps) {
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
            <bdi data-status="loaded" data-value={loaded}>
              {formatLoaded(messages, loaded, pages, format)}
            </bdi>
            <FeedProgress {...progress} />
            <bdi data-status="selected" data-value={status.selectedCount}>
              {messages.selected({ count: status.selectedCount })}
            </bdi>
            <bdi data-status="active" data-value={status.active}>
              {messages.activeCell({ cell: none(status.active) })}
            </bdi>
            <bdi data-status="range" data-value={status.range}>
              {messages.cellRange({ range: none(status.range) })}
            </bdi>
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

interface SelectAllProps {
  handle: SheetHandle;
  loaded: number;
}

function SelectAll({ handle, loaded }: SelectAllProps) {
  const messages = useMessages();
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

export function DataGrid(props: DataGridProps) {
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

  const root = usePart(
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
              columns={columns}
              controls={controls}
              totalWidth={layout.totalWidth}
              selectAll={<SelectAll handle={handle} loaded={rows.length} />}
            />
            <GridBody
              rowWindow={props}
              handle={handle}
              layout={layout}
              rows={rows}
              format={format}
            />
          </>
        ),
      },
      { "data-part": "grid-scroller" },
    ),
    "div",
  );

  return (
    <div className="qg-grid" data-part="grid" style={FILL_COLUMN_STYLE}>
      <div className="qg-grid-toolbar">
        <GridStatus
          handle={handle}
          loaded={rows.length}
          pages={props.pages}
          format={format}
          loading={props.loading}
          capped={props.capped}
          hasNext={props.hasNext}
        />
        <ColumnsMenu
          fields={fields}
          columns={state}
          onColumnsChange={(next) => update(() => next)}
        />
      </div>
      {root}
    </div>
  );
}
