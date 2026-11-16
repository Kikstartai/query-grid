import { getField, type BaseGridDef, type GridRow } from "./grid-def.ts";
import type { Problem } from "./problems.ts";
import { listThenBy, type QueryState } from "./query-state.ts";

export interface RowMove {
  id: string;
  index: number;
  after: string | null;
  before: string | null;
}

export interface ReorderWindow {
  loaded: boolean;
  hasNext: boolean;
}

export type ReorderCode =
  | "reorder_needs_order"
  | "reorder_needs_all_rows"
  | "reorder_grouped";

export const REORDER_CODES: readonly ReorderCode[] = [
  "reorder_needs_order",
  "reorder_needs_all_rows",
  "reorder_grouped",
];

export function canReorder(def: BaseGridDef): boolean {
  return def.orderField !== undefined && getField(def, def.orderField) !== null;
}

// A manual order is only what the user sees when every row is in hand, in that order and nothing else: a move between two loaded rows of a longer or differently sorted list would land somewhere the user never saw.
export function explainReorder(
  def: BaseGridDef,
  query: QueryState,
  feed: ReorderWindow,
): Problem | null {
  const field = def.orderField ?? "";
  const ordered =
    query.sort.field === field &&
    query.sort.direction === "asc" &&
    listThenBy(query).length === 0;
  if (query.group !== null) {
    return { code: "reorder_grouped", params: { field } };
  }
  if (!ordered) {
    return { code: "reorder_needs_order", params: { field } };
  }
  if (!feed.loaded || feed.hasNext) {
    return { code: "reorder_needs_all_rows", params: { field } };
  }
  return null;
}

function without(ids: string[], id: string): string[] {
  return ids.filter((item) => item !== id);
}

export function resolveRowMove(
  previous: string[],
  next: string[],
): RowMove | null {
  const from = previous.findIndex((id, at) => id !== next[at]);
  if (from < 0 || previous.length !== next.length) {
    return null;
  }
  const id = [previous[from], next[from]].find(
    (candidate) =>
      without(previous, candidate).join("\u0000") ===
      without(next, candidate).join("\u0000"),
  );
  if (id === undefined) {
    return null;
  }
  const index = next.indexOf(id);
  return {
    id,
    index,
    after: next[index - 1] ?? null,
    before: next[index + 1] ?? null,
  };
}

function compareOrder(field: string, a: GridRow, b: GridRow): number {
  return (
    Number(a[field] ?? 0) - Number(b[field] ?? 0) || (a.id < b.id ? -1 : 1)
  );
}

function listSlotValues(field: string, sorted: GridRow[]): number[] {
  const values = sorted.map((row) => row[field]);
  const rising = values.every(
    (value, at) =>
      typeof value === "number" &&
      (at === 0 || value > (values[at - 1] as number)),
  );
  return rising ? (values as number[]) : values.map((_, slot) => slot + 1);
}

// The moved row takes its place beside its new neighbour and the order values are dealt out again over the same slots, so a row a filter hides keeps a place; values that repeat or are missing cannot hold an order, so those lists are numbered afresh.
export function reorderRows(
  field: string,
  rows: GridRow[],
  move: RowMove,
): GridRow[] {
  const sorted = [...rows].sort((a, b) => compareOrder(field, a, b));
  const moved = sorted.find((row) => row.id === move.id);
  const anchor = move.after ?? move.before;
  if (!moved || anchor === null) {
    return [];
  }
  const rest = sorted.filter((row) => row !== moved);
  const at = rest.findIndex((row) => row.id === anchor);
  if (at < 0) {
    return [];
  }
  const place = move.after === null ? at : at + 1;
  const next = [...rest.slice(0, place), moved, ...rest.slice(place)];
  const values = listSlotValues(field, sorted);
  return next.flatMap((row, slot) =>
    row[field] === values[slot] ? [] : [{ ...row, [field]: values[slot] }],
  );
}
