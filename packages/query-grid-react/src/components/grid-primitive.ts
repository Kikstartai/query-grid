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
  type GridFormat,
  type GridRow,
} from "@kikstart/query-grid";

const ROW_ESTIMATE = 37;
export const HEADER_HEIGHT = 40;
const REACH_EVERY_ROW = 400;

interface SheetOptions {
  rows: GridRow[];
  columns: BaseFieldDef[];
  format?: GridFormat;
  onEndReached?: () => void;
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

function cellOf(target: EventTarget | null, row: number): GridCell | null {
  const el =
    target instanceof Element
      ? target.closest<HTMLElement>("[data-col]")
      : null;
  return el ? { row, col: Number(el.dataset.col) } : null;
}

/** @internal */
export const sheet = definePrimitive({
  name: "query-grid-sheet",
  options: {
    rows: "value",
    columns: "value",
    format: "value",
    onEndReached: "callback",
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
    const cellText = (cell: GridCell) => {
      const field = columns()[cell.col];
      const row = rows()[cell.row];
      return field && row
        ? formatValue(field, row[field.key] ?? null, context.options().format)
        : "";
    };
    const virtual = createVirtualizer({
      count: rowCount,
      estimate: () => ROW_ESTIMATE,
      key: (index) => rowId(index) ?? String(index),
      overscan: 8,
      endThreshold: 60,
      scrollMargin: HEADER_HEIGHT,
      keep: () => {
        const active = context.store.get().active;
        return active && active.row < rowCount() ? [active.row] : [];
      },
      onEnd: () => context.options().onEndReached?.(),
    });
    const reveal = (cell: GridCell) => virtual.scrollToIndex(cell.row);
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
    const clear = () => {
      context.store.set({
        active: null,
        range: null,
        selected: [],
        copied: "",
      });
      virtual.reset();
    };
    return {
      virtual,
      grid,
      range,
      selection,
      rowId,
      colCount,
      pressRow,
      toggleAll: () => selection.toggleAll({ reason: "imperative" }),
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
        keydown: (event, { api }) => {
          api.range.keydown(event);
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
