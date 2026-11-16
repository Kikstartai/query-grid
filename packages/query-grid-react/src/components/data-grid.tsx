"use client";

import type { ReorderMessage } from "@ui-sdk/core";
import { Button } from "@ui-sdk/react/button";
import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox";
import {
  createMenuController,
  Menu,
  MenuContent,
  MenuTrigger,
  type MenuController,
} from "@ui-sdk/react/menu";
import {
  usePart,
  usePrimitive,
  type PrimitiveHandle,
} from "@ui-sdk/react/primitive";
import {
  createContext,
  use,
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import {
  formatValue,
  resolveRowMove,
  type GridRow,
  type RowMove,
  type SortDirection,
  type SortState,
} from "@kikstart/query-grid";

import { FieldCell } from "./cells.tsx";
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
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  GripIcon,
  MoreIcon,
} from "./icons.tsx";
import { countParams, useLocale, useMessages } from "./messages.tsx";
import { FILL_COLUMN_STYLE, withData } from "./part-props.ts";
import { rowRail, type RailView } from "./row-rail.ts";
import { useColumnState } from "./use-column-state.ts";
import { useVirtualItems } from "./use-virtual-items.ts";

type SheetHandle = PrimitiveHandle<typeof sheet>;
type RailHandle = PrimitiveHandle<typeof rowRail>;
type Column = GridColumn<FieldDef>;

const REORDER_COLUMN_WIDTH = 32;
const ACTIONS_COLUMN_WIDTH = 44;

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

export interface GridSelection {
  ids: string[];
  allMatching: boolean;
}

export interface GridReorder {
  disabled?: boolean;
  reason?: string | null;
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
  sorts?: SortState[];
  sortableFields?: string[];
  addableSortFields?: string[];
  sortReasons?: Record<string, string>;
  onSortChange?: (field: string, direction: SortDirection) => void;
  onSortAdd?: (field: string, direction: SortDirection) => void;
  onSortRemove?: (field: string) => void;
  filters?: Record<string, ReactNode>;
  activeFilters?: string[];
  onSelectionChange?: (selection: GridSelection) => void;
  selectionKey?: unknown;
  matchingCount?: string | null;
  rowLabel?: (row: GridRow) => string;
  onRowOpen?: (row: GridRow) => void;
  rowHref?: (row: GridRow) => string | null;
  rowActions?: (row: GridRow) => ReactNode;
  onRowAction?: (value: string, row: GridRow) => unknown;
  reorder?: GridReorder;
  onRowReorder?: (move: RowMove) => void;
}

export interface DataGridRootProps extends DataGridProps {
  children: ReactNode;
}

export interface DataGridToolbarProps {
  children: ReactNode;
}

export interface DataGridSelectionProps {
  children?: ReactNode;
}

interface GridLayout {
  columns: Column[];
  totalWidth: number;
  pinnedWidth: number;
  lead: number;
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

interface SelectionControls {
  allMatching: boolean;
  selectMatching: () => void;
}

interface DataGridContextValue {
  props: DataGridProps;
  rows: GridRow[];
  entries: GridEntry[] | null;
  handle: SheetHandle;
  rail: RailHandle | null;
  menu: MenuController<GridRow>;
  selection: SelectionControls;
  labelOf: (row: GridRow) => string;
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

const LEAD_CELL_STYLE = {
  position: "sticky" as const,
  zIndex: 1,
  display: "flex",
  flexShrink: 0,
  boxSizing: "border-box" as const,
};

interface RowCellProps {
  row: GridRow;
}

interface SelectCellProps extends RowCellProps {
  view: RowView;
}

function SelectCell({ row, view }: SelectCellProps) {
  const { handle } = useDataGrid();
  const messages = useMessages();
  return (
    <div
      className="qg-cell qg-select-cell"
      style={{
        ...LEAD_CELL_STYLE,
        insetInlineStart: 0,
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
  );
}

interface ReorderHandleProps extends RowCellProps {
  rail: RailHandle;
}

function ReorderHandle({ rail, row }: ReorderHandleProps) {
  const { props, labelOf } = useDataGrid();
  const messages = useMessages();
  return usePart(
    rail,
    "handle",
    { value: row.id },
    withData(
      {
        type: "button" as const,
        className: "qg-reorder-handle",
        "aria-label": messages.reorderRow({ label: labelOf(row) }),
        "aria-disabled": props.reorder?.disabled ? true : undefined,
        title: props.reorder?.reason ?? undefined,
        style: { touchAction: "none" as const },
        children: <GripIcon />,
      },
      { "data-reorder-handle": row.id },
    ),
    "button",
  );
}

function ReorderCell({ row }: RowCellProps) {
  const { rail } = useDataGrid();
  if (!rail) {
    return null;
  }
  return (
    <div
      className="qg-cell qg-reorder-cell"
      style={{
        ...LEAD_CELL_STYLE,
        insetInlineStart: SELECT_COLUMN_WIDTH,
        width: REORDER_COLUMN_WIDTH,
      }}
    >
      <ReorderHandle rail={rail} row={row} />
    </div>
  );
}

function isPlainClick(event: ReactMouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  );
}

interface OpenTargetProps extends RowCellProps {
  children: ReactNode;
}

function OpenTarget({ row, children }: OpenTargetProps) {
  const { props } = useDataGrid();
  const { onRowOpen } = props;
  const href = props.rowHref?.(row) ?? null;
  if (href !== null) {
    return (
      <a
        className="qg-row-open"
        href={href}
        tabIndex={-1}
        data-row-open={row.id}
        onClick={(event) => {
          if (onRowOpen && isPlainClick(event)) {
            event.preventDefault();
            onRowOpen(row);
          }
        }}
      >
        {children}
      </a>
    );
  }
  if (!onRowOpen) {
    return children;
  }
  return (
    <Button
      className="qg-row-open"
      tabIndex={-1}
      data-row-open={row.id}
      onClick={() => onRowOpen(row)}
    >
      {children}
    </Button>
  );
}

interface ActionsCellProps extends RowCellProps {
  active: boolean;
}

function ActionsCell({ row, active }: ActionsCellProps) {
  const { props, menu, labelOf } = useDataGrid();
  const messages = useMessages();
  if (!props.rowActions) {
    return null;
  }
  return (
    <div
      className="qg-cell qg-actions-cell"
      style={{
        ...LEAD_CELL_STYLE,
        insetInlineEnd: 0,
        width: ACTIONS_COLUMN_WIDTH,
      }}
    >
      <MenuTrigger
        controller={menu}
        payload={row}
        className="qg-row-actions"
        aria-label={messages.rowActions({ label: labelOf(row) })}
        data-row-actions={row.id}
        tabIndex={active ? 0 : -1}
      >
        <MoreIcon />
      </MenuTrigger>
    </div>
  );
}

function RowActionsMenu() {
  const { props, menu } = useDataGrid();
  const { rowActions, onRowAction } = props;
  if (!rowActions) {
    return null;
  }
  return (
    <Menu
      controller={menu}
      onAction={(value: string) => {
        const row = menu.getPayload();
        return row ? onRowAction?.(value, row) : undefined;
      }}
    >
      <MenuContent<GridRow> align="end" data-part="row-actions-menu">
        {(state) => (state.payload ? rowActions(state.payload) : null)}
      </MenuContent>
    </Menu>
  );
}

interface CellContentProps extends RowCellProps {
  column: Column;
  opens: boolean;
}

function CellContent({ column, row, opens }: CellContentProps) {
  const content = (
    <FieldCell
      field={column.field}
      value={row[column.field.key] ?? null}
      row={row}
    />
  );
  if (!opens) {
    return content;
  }
  return <OpenTarget row={row}>{content}</OpenTarget>;
}

interface GridCellsProps {
  view: RowView;
  row: GridRow;
  columns: Column[];
}

function GridCells({ view, row, columns }: GridCellsProps) {
  const { layout } = useDataGrid();
  return (
    <>
      <SelectCell row={row} view={view} />
      <ReorderCell row={row} />
      {columns.map((column, col) => {
        const cell = view.cells[col];
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
                ? layout.lead + column.start
                : undefined,
            }}
          >
            <CellContent column={column} row={row} opens={col === 0} />
          </div>
        );
      })}
      <ActionsCell row={row} active={view.cells.some((cell) => cell.active)} />
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
        style: rowStyle(start, layout),
        children: (view: RowView) => (
          <GridCells view={view} row={row} columns={layout.columns} />
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

function rowStyle(start: number, layout: GridLayout) {
  return {
    position: "absolute" as const,
    top: 0,
    insetInlineStart: 0,
    display: "flex",
    transform: `translateY(${start}px)`,
    width: layout.totalWidth,
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
      style={rowStyle(start, layout)}
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
      style={rowStyle(start, layout)}
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

interface RowsFrameProps {
  mounted: number;
  size: number;
  grouped?: boolean;
  children: ReactNode;
}

function RowsFrame({ mounted, size, grouped, children }: RowsFrameProps) {
  const { layout, rail } = useDataGrid();
  return (
    <div
      className="qg-rows"
      role="rowgroup"
      data-part="grid-rows"
      data-grouped={grouped ? "" : undefined}
      data-reorder={rail ? "" : undefined}
      data-mounted={mounted}
      style={{
        position: "relative",
        height: size,
        width: layout.totalWidth,
      }}
    >
      {children}
    </div>
  );
}

function GroupedRows() {
  const { entries, handle, layout } = useDataGrid();
  const { items, size } = useVirtualItems(handle.api.virtual);
  return (
    <RowsFrame mounted={items.length} size={size} grouped>
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
    </RowsFrame>
  );
}

function GridRows() {
  const { rows, handle, layout } = useDataGrid();
  const { items, size } = useVirtualItems(handle.api.virtual);
  return (
    <RowsFrame mounted={items.length} size={size}>
      {items.flatMap((item) => {
        const row = rows[item.index];
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
    </RowsFrame>
  );
}

function GridBody() {
  const { props, entries } = useDataGrid();
  if (entries && (props.error || entries.length === 0)) {
    return <FeedNotice {...props} />;
  }
  if (entries) {
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

function ReorderError() {
  const { props } = useDataGrid();
  const error = props.reorder?.error;
  if (!error) {
    return null;
  }
  return (
    <bdi className="qg-notice-error" role="alert" data-reorder-error>
      {error}
    </bdi>
  );
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

interface SelectedCountProps {
  count: number;
}

function MatchingOffer({ count }: SelectedCountProps) {
  const { props, rows, entries, selection } = useDataGrid();
  const messages = useMessages();
  const { matchingCount } = props;
  const offered =
    !entries &&
    !selection.allMatching &&
    props.hasNext &&
    count === rows.length;
  if (!offered || !matchingCount) {
    return null;
  }
  return (
    <Button data-select-matching onClick={selection.selectMatching}>
      <bdi>{messages.selectAllMatching({ rows: matchingCount })}</bdi>
    </Button>
  );
}

function SelectionSummary({ count }: SelectedCountProps) {
  const { props, selection } = useDataGrid();
  const messages = useMessages();
  const locale = useLocale();
  if (selection.allMatching) {
    return (
      <bdi data-selection="matching">
        {messages.allMatchingSelected({ rows: props.matchingCount ?? "" })}
      </bdi>
    );
  }
  return (
    <bdi data-selection="rows" data-value={count}>
      {messages.selectedRows(countParams(count, locale))}
    </bdi>
  );
}

function DataGridSelection({ children }: DataGridSelectionProps) {
  const { handle } = useDataGrid();
  const messages = useMessages();
  return usePart(
    handle,
    "status",
    { id: "selection" },
    withData(
      {
        className: (status: SheetStatus) =>
          status.selectedCount > 0
            ? "qg-selection"
            : "qg-selection qg-selection-empty",
        children: (status: SheetStatus) => (
          <>
            <SelectionSummary count={status.selectedCount} />
            <MatchingOffer count={status.selectedCount} />
            <Button data-selection-clear onClick={handle.api.clearSelection}>
              <bdi>{messages.clearSelection}</bdi>
            </Button>
            <span className="qg-selection-actions">{children}</span>
          </>
        ),
      },
      { "data-part": "grid-selection" },
    ),
    "div",
  );
}

interface GridFrameProps extends DataGridRootProps {
  rail: RailHandle | null;
  keepRow: number | null;
}

function GridFrame({ children, rail, keepRow, ...props }: GridFrameProps) {
  const { fields, resetKey, selectionKey, onSelectionChange } = props;
  const grouped = props.groups ? layoutGroups(props.groups) : null;
  const rows = grouped?.rows ?? props.rows;
  const locale = useLocale();
  const { columns: state, update } = useColumnState(props);
  const columns = layoutColumns(fields, state);
  const [menu] = useState(() => createMenuController<GridRow>());
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [allMatching, setAllMatching] = useState(false);
  const [seenKey, setSeenKey] = useState(resetKey);
  const [seenSelectionKey, setSeenSelectionKey] = useState(selectionKey);
  const [epoch, setEpoch] = useState(0);
  const [selectionEpoch, setSelectionEpoch] = useState(0);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setEpoch(epoch + 1);
  }
  if (seenSelectionKey !== selectionKey) {
    setSeenSelectionKey(selectionKey);
    setSelectionEpoch(selectionEpoch + 1);
  }
  const lead = SELECT_COLUMN_WIDTH + (rail ? REORDER_COLUMN_WIDTH : 0);
  const trail = props.rowActions ? ACTIONS_COLUMN_WIDTH : 0;
  const layout: GridLayout = {
    columns,
    totalWidth: lead + sumWidths(columns) + trail,
    pinnedWidth: sumWidths(columns.filter((column) => column.pinned)),
    lead,
    layoutKey: `${epoch}:${columns.map((column) => column.field.key).join(",")}`,
  };
  const press = (row: number, target: string) =>
    scroller
      ?.querySelector<HTMLElement>(`[data-row="${row}"] [${target}]`)
      ?.click();
  const opens = Boolean(props.onRowOpen ?? props.rowHref);
  const handle = usePrimitive(sheet, {
    rows,
    columns: columns.map((column) => column.field),
    locale,
    layout: grouped?.layout ?? null,
    keepRow,
    onEndReached: props.onEndReached,
    onSelectedChange: (ids) => {
      const all = allMatching && ids.length > 0 && ids.length === rows.length;
      setAllMatching(all);
      onSelectionChange?.({ ids, allMatching: all });
    },
    onRowOpen: opens ? (row) => press(row, "data-row-open") : undefined,
    onRowMenu: props.rowActions
      ? (row) => press(row, "data-row-actions")
      : undefined,
  });
  const first = columns[0]?.field;
  const labelOf =
    props.rowLabel ??
    ((row: GridRow) =>
      first ? formatValue(first, row[first.key] ?? null, locale) : row.id);

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

  useEffect(() => {
    if (selectionEpoch > 0) {
      handle.api.clearSelection();
    }
  }, [handle, selectionEpoch]);

  useEffect(() => {
    if (allMatching) {
      handle.api.selectAll();
    }
  }, [handle, allMatching, rows]);

  return (
    <div className="qg-grid" data-part="grid" style={FILL_COLUMN_STYLE}>
      <DataGridContext
        value={{
          props,
          rows,
          entries: grouped?.entries ?? null,
          handle,
          rail,
          menu,
          selection: {
            allMatching,
            selectMatching: () => {
              setAllMatching(true);
              onSelectionChange?.({
                ids: rows.map((row) => row.id),
                allMatching: true,
              });
            },
          },
          labelOf,
          state,
          update,
          layout,
          setScroller,
        }}
      >
        {children}
        <RowActionsMenu />
      </DataGridContext>
    </div>
  );
}

function orderRows(rows: GridRow[], order: string[]): GridRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = order.flatMap((id) => byId.get(id) ?? []);
  return ordered.length === rows.length ? ordered : rows;
}

function ReorderableGrid(props: DataGridRootProps) {
  const messages = useMessages();
  const locale = useLocale();
  const { rows, onRowReorder } = props;
  const ids = rows.map((row) => row.id);
  const first = props.fields.find((field) => !field.hidden);
  const labelOf = (id: string) => {
    const row = rows.find((item) => item.id === id);
    if (!row) {
      return undefined;
    }
    if (props.rowLabel) {
      return props.rowLabel(row);
    }
    return first ? formatValue(first, row[first.key] ?? null, locale) : id;
  };
  const rail = usePrimitive(rowRail, {
    order: ids,
    disabled: props.reorder?.disabled === true,
    labelOf,
    describe: (message: ReorderMessage) =>
      messages.reorderSteps[message.type](message),
    onOrderChange: (order) => {
      const move = resolveRowMove(ids, order);
      if (move) {
        onRowReorder?.(move);
      }
    },
  });
  return usePart(
    rail,
    "root",
    {},
    {
      style: { display: "contents" },
      children: (view: RailView) => (
        <GridFrame
          {...props}
          rows={orderRows(rows, view.order)}
          rail={rail}
          keepRow={
            view.moving === null ? null : view.order.indexOf(view.moving)
          }
        />
      ),
    },
    "div",
  );
}

function DataGridRoot(props: DataGridRootProps) {
  if (props.onRowReorder && !props.groups) {
    return <ReorderableGrid {...props} />;
  }
  return <GridFrame {...props} rail={null} keepRow={null} />;
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
              <ReorderError />
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

const HEADER_CELL_STYLE = { ...LEAD_CELL_STYLE, zIndex: 3 };

function ReorderHeaderCell() {
  const { props, rail } = useDataGrid();
  const messages = useMessages();
  if (!rail) {
    return null;
  }
  return (
    <div
      className="qg-header-cell qg-reorder-cell"
      role="columnheader"
      aria-label={messages.reorderColumn}
      title={props.reorder?.reason ?? messages.reorderHelp}
      data-reorder-header
      data-unavailable={props.reorder?.disabled ? "" : undefined}
      style={{
        ...HEADER_CELL_STYLE,
        insetInlineStart: SELECT_COLUMN_WIDTH,
        width: REORDER_COLUMN_WIDTH,
      }}
    />
  );
}

function ActionsHeaderCell() {
  const { props } = useDataGrid();
  if (!props.rowActions) {
    return null;
  }
  return (
    <div
      className="qg-header-cell qg-actions-cell"
      role="columnheader"
      style={{
        ...HEADER_CELL_STYLE,
        insetInlineEnd: 0,
        width: ACTIONS_COLUMN_WIDTH,
      }}
    />
  );
}

function DataGridBody() {
  const { props, handle, update, layout, setScroller } = useDataGrid();
  const controls: HeaderControls = {
    sort: props.sort,
    sorts: props.sorts,
    sortableFields: props.sortableFields,
    addableSortFields: props.addableSortFields,
    sortReasons: props.sortReasons,
    onSortChange: props.onSortChange,
    onSortAdd: props.onSortAdd,
    onSortRemove: props.onSortRemove,
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
          scrollPaddingInlineStart: layout.lead + layout.pinnedWidth,
        },
        children: (
          <>
            <GridHeader
              columns={layout.columns}
              controls={controls}
              totalWidth={layout.totalWidth}
              lead={layout.lead}
              selectAll={<SelectAll />}
              leading={<ReorderHeaderCell />}
              trailing={<ActionsHeaderCell />}
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
      <DataGridSelection />
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
  Selection: DataGridSelection,
  Body: DataGridBody,
});
