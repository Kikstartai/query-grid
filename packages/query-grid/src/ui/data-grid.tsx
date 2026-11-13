"use client";

import { Button } from "@ui-sdk/react/button";
import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/react/popover";
import {
  usePart,
  usePrimitive,
  type PrimitiveHandle,
} from "@ui-sdk/react/primitive";
import { useEffect, useState } from "react";

import type { ColumnState, GridColumn } from "../model/column-state.ts";
import type { GridFormat, GridRow } from "../model/field-types.ts";
import { formatLoaded, formatValue } from "../model/format.ts";
import {
  useColumns,
  useFeedState,
  useQueryGrid,
} from "../react/query-grid-provider.tsx";
import { FeedNotice, isFeedBlank } from "./feed-notice.tsx";
import { GridHeader, SELECT_COLUMN_WIDTH } from "./grid-header.tsx";
import { HEADER_HEIGHT, sheet, type RowView } from "./grid-primitive.ts";
import { CheckIcon, ColumnsIcon, PinIcon } from "./icons.tsx";
import { withData } from "./part-props.ts";
import { useVirtualItems } from "./use-virtual-items.ts";

type SheetHandle = PrimitiveHandle<typeof sheet>;

interface GridLayout {
  columns: GridColumn[];
  totalWidth: number;
  pinnedWidth: number;
  layoutKey: string;
}

function sumWidths(columns: GridColumn[]): number {
  return columns.reduce((sum, column) => sum + column.width, 0);
}

interface GridCellsProps {
  handle: SheetHandle;
  view: RowView;
  row: GridRow;
  columns: GridColumn[];
  format?: GridFormat;
}

function GridCells({ handle, view, row, columns, format }: GridCellsProps) {
  return (
    <>
      <div
        className="qg-cell qg-select-cell"
        style={{
          position: "sticky",
          left: 0,
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
          aria-label="Select row"
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
              left: column.pinned
                ? SELECT_COLUMN_WIDTH + column.left
                : undefined,
            }}
          >
            {column.field.cell
              ? column.field.cell(value, row)
              : formatValue(column.field, value, format)}
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
          left: 0,
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
}

function GridRows({ handle, layout }: GridRowsProps) {
  const { def } = useQueryGrid();
  const { virtual } = handle.api;
  const feed = useFeedState();
  const { items, size } = useVirtualItems(virtual);
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
        const row = feed.rows[item.index];
        return row
          ? [
              <GridRowPart
                key={`${item.key}:${layout.layoutKey}`}
                handle={handle}
                index={item.index}
                start={item.start}
                row={row}
                layout={layout}
                format={def.format}
              />,
            ]
          : [];
      })}
    </div>
  );
}

function GridBody({ handle, layout }: GridRowsProps) {
  const feed = useFeedState();
  if (isFeedBlank(feed)) {
    return <FeedNotice feed={feed} />;
  }
  return <GridRows handle={handle} layout={layout} />;
}

interface ColumnToggleProps {
  column: ColumnState;
  label: string;
}

function ColumnToggle({ column, label }: ColumnToggleProps) {
  const { store } = useColumns();
  return (
    <div className="qg-column-row" data-column={column.key}>
      <label className="qg-check-label">
        <Checkbox
          className="qg-checkbox"
          checked={column.visible}
          data-column-toggle={column.key}
          onCheckedChange={(checked: boolean | "indeterminate") =>
            store.setVisible(column.key, checked === true)
          }
        >
          <CheckboxIndicator className="qg-checkbox-indicator">
            <CheckIcon size={12} />
          </CheckboxIndicator>
        </Checkbox>
        {label}
      </label>
      <Button
        className="qg-pin"
        aria-label={`Pin ${label}`}
        aria-pressed={column.pinned}
        data-column-pin={column.key}
        onClick={() => store.setPinned(column.key, !column.pinned)}
      >
        <PinIcon size={12} />
      </Button>
    </div>
  );
}

export function ColumnsMenu() {
  const { def } = useQueryGrid();
  const { state, store } = useColumns();
  return (
    <Popover>
      <PopoverTrigger
        className="qg-button"
        aria-label="Columns"
        data-part="columns-menu-trigger"
      >
        <ColumnsIcon />
        Columns
      </PopoverTrigger>
      <PopoverContent
        className="qg-popup qg-popover qg-columns-menu"
        align="end"
        data-part="columns-menu"
      >
        <PopoverTitle className="qg-popover-title">Columns</PopoverTitle>
        <div className="qg-columns-list">
          {state.map((column) => (
            <ColumnToggle
              key={column.key}
              column={column}
              label={
                def.fields.find((field) => field.key === column.key)?.label ??
                column.key
              }
            />
          ))}
        </div>
        <Button
          className="qg-button qg-button-ghost"
          data-columns-reset
          onClick={store.reset}
        >
          Reset columns
        </Button>
      </PopoverContent>
    </Popover>
  );
}

interface SheetStatus {
  active: string;
  range: string;
  selectedCount: number;
  copied: string;
}

function FeedProgress() {
  const feed = useFeedState();
  if (feed.status === "loading") {
    return <span data-status="feed">loading…</span>;
  }
  if (feed.capped) {
    return <span data-status="feed">result capped, refine the filter</span>;
  }
  if (!feed.hasNext) {
    return <span data-status="feed">end of results</span>;
  }
  return <span data-status="feed" />;
}

function GridStatus({ handle }: { handle: SheetHandle }) {
  const { def } = useQueryGrid();
  const feed = useFeedState();
  return usePart(
    handle,
    "status",
    {},
    withData(
      {
        className: "qg-status",
        children: (status: SheetStatus) => (
          <>
            <span data-status="loaded" data-value={feed.rows.length}>
              {formatLoaded(feed.rows.length, feed.pages, def.format)}
            </span>
            <FeedProgress />
            <span data-status="selected" data-value={status.selectedCount}>
              {status.selectedCount} selected
            </span>
            <span data-status="active">cell {status.active}</span>
            <span data-status="range">range {status.range}</span>
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
  return usePart(
    handle,
    "status",
    { id: "select-all" },
    {
      children: (status: SheetStatus) => (
        <Checkbox
          className="qg-checkbox"
          aria-label="Select all loaded rows"
          data-select-all
          checked={loaded > 0 && status.selectedCount === loaded}
          onCheckedChange={handle.api.toggleAll}
        >
          <CheckboxIndicator className="qg-checkbox-indicator">
            <CheckIcon size={12} />
          </CheckboxIndicator>
        </Checkbox>
      ),
    },
    "span",
  );
}

export function DataGrid() {
  const { def, feed } = useQueryGrid();
  const { layout: columns, store } = useColumns();
  const feedState = useFeedState();
  const layout: GridLayout = {
    columns,
    totalWidth: sumWidths(columns),
    pinnedWidth: sumWidths(columns.filter((column) => column.pinned)),
    layoutKey: columns.map((column) => column.field.key).join(","),
  };
  const handle = usePrimitive(sheet, {
    feed,
    columns: columns.map((column) => column.field),
    format: def.format,
  });
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const loaded = feedState.rows.length;
  const query = feedState.query;
  const rows = feedState.rows;

  useEffect(() => {
    handle.api.virtual.refresh();
  }, [handle, rows, layout.layoutKey]);

  useEffect(() => {
    handle.api.clear();
    scroller?.scrollTo({ top: 0 });
  }, [handle, scroller, query]);

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
          scrollPaddingLeft: SELECT_COLUMN_WIDTH + layout.pinnedWidth,
        },
        children: (
          <>
            <GridHeader
              columns={columns}
              store={store}
              totalWidth={layout.totalWidth}
              selectAll={<SelectAll handle={handle} loaded={loaded} />}
            />
            <GridBody handle={handle} layout={layout} />
          </>
        ),
      },
      { "data-part": "grid-scroller" },
    ),
    "div",
  );

  return (
    <div
      className="qg-grid"
      data-part="grid"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        minWidth: 0,
        flex: "1 1 0%",
      }}
    >
      <div className="qg-grid-toolbar">
        <GridStatus handle={handle} />
        <ColumnsMenu />
      </div>
      {root}
    </div>
  );
}
