import {
  cellsToText,
  createCellRange,
  createChange,
  createGridFocus,
  createSelection,
  createVirtualizer,
  definePrimitive,
  selects,
  type CellRange,
  type GridCell,
} from "@ui-sdk/core";

import {
  formatValue,
  type BaseFieldDef,
  type GridRow,
} from "@kikstart/query-grid";

const ROW_ESTIMATE = 37;
export const HEADER_HEIGHT = 40;
const REACH_EVERY_ROW = 400;

export interface SheetLayout {
  keys: string[];
  rowItems: number[];
}

interface SheetOptions {
  rows: GridRow[];
  columns: BaseFieldDef[];
  locale: string;
  layout?: SheetLayout | null;
  keepRow?: number | null;
  onEndReached?: () => void;
  onSelectedChange?: (selected: string[]) => void;
  onRowOpen?: (row: number) => void;
  onRowMenu?: (row: number) => void;
}

interface SheetState {
  active: GridCell | null;
  range: CellRange | null;
  selected: string[];
  copied: string;
}

interface CellView {
  tabIndex: number;
  active: boolean;
  selected: boolean;
}

export interface RowView {
  selected: boolean;
  cells: CellView[];
}

interface RowPart {
  props: { row: number };
}

const rowName = (row: number) => `r${row}`;

const selectedSets = new WeakMap<string[], Set<string>>();

function readSelectedSet(ids: string[]): Set<string> {
  const known = selectedSets.get(ids) ?? new Set(ids);
  selectedSets.set(ids, known);
  return known;
}

const byRow = {
  values: ({ props }: RowPart) => [rowName(props.row)],
  moved(
    previous: GridCell | null | undefined,
    next: GridCell | null | undefined,
    notify: (name: string) => void,
  ) {
    if (!previous || !next) {
      return true;
    }
    notify(rowName(previous.row));
    notify(rowName(next.row));
  },
};

function rowSpan(range: CellRange | null | undefined): [number, number] | null {
  if (!range) {
    return null;
  }
  return [
    Math.min(range.anchor.row, range.end.row),
    Math.max(range.anchor.row, range.end.row),
  ];
}

const byRowRange = {
  values: ({ props }: RowPart) => [rowName(props.row)],
  moved(
    previous: CellRange | null | undefined,
    next: CellRange | null | undefined,
    notify: (name: string) => void,
  ) {
    const spans = [rowSpan(previous), rowSpan(next)].filter(
      (span) => span !== null,
    );
    const reach = spans.reduce((sum, [top, bottom]) => sum + bottom - top, 0);
    if (reach > REACH_EVERY_ROW) {
      return true;
    }
    for (const [top, bottom] of spans) {
      for (let row = top; row <= bottom; row++) {
        notify(rowName(row));
      }
    }
  },
};

const CELL_CONTROL = "a[href], button";

// A press on a link or a button inside a cell is that control's: starting a range there would take the pointer and the click with it.
function cellOf(target: EventTarget | null, row: number): GridCell | null {
  if (!(target instanceof Element) || target.closest(CELL_CONTROL)) {
    return null;
  }
  const el = target.closest<HTMLElement>("[data-col]");
  return el ? { row, col: Number(el.dataset.col) } : null;
}

/** @internal */
export const sheet = definePrimitive({
  name: "query-grid-sheet",
  options: {
    rows: "value",
    columns: "value",
    locale: "value",
    layout: "value",
    keepRow: "value",
    onEndReached: "callback",
    onSelectedChange: "callback",
    onRowOpen: "callback",
    onRowMenu: "callback",
  },
  state: (_options: SheetOptions): SheetState => ({
    active: null,
    range: null,
    selected: [],
    copied: "",
  }),
  api: (context) => {
    const rows = () => context.options().rows;
    const columns = () => context.options().columns;
    const rowCount = () => rows().length;
    const colCount = () => columns().length;
    const rowId = (row: number) => rows()[row]?.id ?? null;
    const layout = () => context.options().layout ?? null;
    const itemOf = (row: number) => layout()?.rowItems[row] ?? row;
    const cellText = (cell: GridCell) => {
      const field = columns()[cell.col];
      const row = rows()[cell.row];
      return field && row
        ? formatValue(field, row[field.key] ?? null, context.options().locale)
        : "";
    };
    const virtual = createVirtualizer({
      count: () => layout()?.keys.length ?? rowCount(),
      estimate: () => ROW_ESTIMATE,
      key: (index) => layout()?.keys[index] ?? rowId(index) ?? String(index),
      overscan: 8,
      endThreshold: 60,
      scrollMargin: HEADER_HEIGHT,
      keep: () => {
        const active = context.store.get().active;
        const kept = context.options().keepRow ?? null;
        return [active?.row ?? null, kept].flatMap((row) =>
          row !== null && row < rowCount() ? [itemOf(row)] : [],
        );
      },
      onEnd: () => context.options().onEndReached?.(),
    });
    const reveal = (cell: GridCell) => virtual.scrollToIndex(itemOf(cell.row));
    const grid = createGridFocus(context, {
      key: "active",
      rows: rowCount,
      cols: colCount,
      pageSize: () => 15,
      reveal,
    });
    const range = createCellRange(context, {
      key: "range",
      grid,
      rows: rowCount,
      cols: colCount,
      reveal,
    });
    const change = createChange(context);
    const selection = createSelection(context, {
      key: "selected",
      set: (value, details) => change("selected", value, details),
      order: () => rows().map((row) => row.id),
      multiple: () => true,
    });
    const pressRow = (id: string, event: MouseEvent | KeyboardEvent) => {
      const why = { reason: "item-press", event };
      if (event.shiftKey) {
        selection.extend(id, why);
        return;
      }
      selection.toggle(id, why);
    };
    const copy = (event: ClipboardEvent) => {
      const state = context.store.get();
      const text =
        range.text(state, cellText) ||
        (state.active ? cellsToText([[cellText(state.active)]]) : "");
      if (!text) {
        return;
      }
      event.clipboardData?.setData("text/plain", text);
      event.preventDefault();
      context.store.set({ copied: text });
    };
    const imperative = { reason: "imperative" } as const;
    const clearSelection = () => {
      if (context.store.get().selected.length > 0) {
        change("selected", [], imperative);
      }
    };
    const clear = () => {
      clearSelection();
      context.store.set({ active: null, range: null, copied: "" });
      virtual.reset();
    };
    // Enter opens the row and the menu key its actions, but only from a cell: a control inside one keeps its own keys.
    const rowKey = (event: KeyboardEvent, row: number): boolean => {
      const options = context.options();
      const onCell =
        event.target instanceof Element && event.target.matches("[data-col]");
      const plain =
        !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
      const open = event.key === "Enter" && plain ? options.onRowOpen : null;
      const menu =
        event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)
          ? options.onRowMenu
          : null;
      const act = open ?? menu;
      if (!onCell || !act) {
        return false;
      }
      event.preventDefault();
      act(row);
      return true;
    };
    return {
      virtual,
      grid,
      range,
      selection,
      rowId,
      colCount,
      pressRow,
      rowKey,
      toggleAll: () => selection.toggleAll(imperative),
      selectAll: () =>
        change(
          "selected",
          rows().map((row) => row.id),
          imperative,
        ),
      clearSelection,
      copy,
      clear,
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "grid",
      keys: { none: "Focus stays on a cell, whose row handles the keys." },
      attrs: (_state, { api }) => ({
        "aria-rowcount": "-1",
        "aria-colcount": String(api.colCount()),
        "aria-multiselectable": "true",
      }),
      on: { copy: (event, { api }) => api.copy(event) },
      bind: (el, { api }) => api.virtual.connect(el),
    }),
    status: slot({
      state: (state) => ({
        active: state.active
          ? `${state.active.row}:${state.active.col}`
          : "none",
        range: state.range
          ? `${state.range.anchor.row}:${state.range.anchor.col}-${state.range.end.row}:${state.range.end.col}`
          : "none",
        selectedCount: state.selected.length,
        copied: state.copied,
      }),
    }),
    row: slot<{ row: number }, RowView>({
      props: { row: "number" },
      role: "row",
      selects: selects({
        active: byRow,
        range: byRowRange,
        selected: ({
          props,
          api,
        }: {
          props: { row: number };
          api: { rowId: (row: number) => string | null };
        }) => {
          const id = api.rowId(props.row);
          return id ? [id] : [];
        },
        copied: [],
      }),
      attrs: (_state, { props }) => ({
        "aria-rowindex": String(props.row + 1),
      }),
      state: (state, { props, api }) => {
        const id = api.rowId(props.row);
        return {
          selected: id !== null && readSelectedSet(state.selected).has(id),
          cells: Array.from({ length: api.colCount() }, (_, col) => {
            const cell = { row: props.row, col };
            return {
              tabIndex: Number(api.grid.tabIndex(state, cell)),
              active: api.grid.isActive(state, cell),
              selected: api.range.contains(state, cell),
            };
          }),
        };
      },
      on: {
        keydown: (event, { api, props }) => {
          const onControl =
            event.target instanceof Element &&
            event.target.closest(CELL_CONTROL) !== null;
          if (!onControl && !api.rowKey(event, props.row)) {
            api.range.keydown(event);
          }
        },
        pointerdown: (event, { api, props }) => {
          const cell = cellOf(event.target, props.row);
          if (cell) {
            api.range.pointerdown(event, cell);
          }
        },
      },
      bind: (el, part) => {
        const cleanups = [
          ...el.querySelectorAll<HTMLElement>("[data-col]"),
        ].map((cell) =>
          part.api.range.bind(cell, {
            row: part.props.row,
            col: Number(cell.dataset.col),
          }),
        );
        return () => cleanups.forEach((cleanup) => cleanup());
      },
    }),
  }),
});
