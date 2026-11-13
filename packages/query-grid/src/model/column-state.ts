import { createEmitter } from "./emitter.ts";
import type { FieldDef, GridDef } from "./field-types.ts";

export const COLUMN_MIN_WIDTH = 60;
export const COLUMN_MAX_WIDTH = 600;
export const COLUMN_DEFAULT_WIDTH = 150;
export const RESIZE_STEP = 10;
export const RESIZE_LARGE_STEP = 50;

const SAVE_DELAY_MS = 200;

export interface ColumnState {
  key: string;
  width: number;
  visible: boolean;
  pinned: boolean;
}

export interface GridColumn {
  field: FieldDef;
  width: number;
  pinned: boolean;
  left: number;
}

export interface ResizeSession {
  key: string;
  startWidth: number;
}

export interface ColumnPersistence {
  load: () => unknown | Promise<unknown>;
  save: (columns: ColumnState[]) => void | Promise<void>;
}

export interface ColumnStore {
  getColumns: () => ColumnState[];
  subscribe: (listener: () => void) => () => void;
  resize: (key: string, width: number) => void;
  setVisible: (key: string, visible: boolean) => void;
  setPinned: (key: string, pinned: boolean) => void;
  setOrder: (keys: string[]) => void;
  restore: () => Promise<void>;
  reset: () => void;
}

export function clampWidth(width: number): number {
  return Math.min(
    COLUMN_MAX_WIDTH,
    Math.max(COLUMN_MIN_WIDTH, Math.round(width)),
  );
}

export function beginResize(key: string, width: number): ResizeSession {
  return { key, startWidth: width };
}

export function resizeWidth(session: ResizeSession, delta: number): number {
  return clampWidth(session.startWidth + delta);
}

export function cancelResize(session: ResizeSession): number {
  return session.startWidth;
}

export function stepWidth(width: number, key: string, large: boolean): number {
  const step = large ? RESIZE_LARGE_STEP : RESIZE_STEP;
  if (key === "ArrowLeft") {
    return clampWidth(width - step);
  }
  if (key === "ArrowRight") {
    return clampWidth(width + step);
  }
  return width;
}

export function defaultColumns(def: GridDef): ColumnState[] {
  return def.fields.map((field) => ({
    key: field.key,
    width: clampWidth(field.width ?? COLUMN_DEFAULT_WIDTH),
    visible: !field.hidden,
    pinned: field.pinned === true,
  }));
}

function normalizeColumn(
  fallback: ColumnState,
  stored: Partial<ColumnState>,
): ColumnState {
  return {
    key: fallback.key,
    width:
      typeof stored.width === "number" && Number.isFinite(stored.width)
        ? clampWidth(stored.width)
        : fallback.width,
    visible:
      typeof stored.visible === "boolean" ? stored.visible : fallback.visible,
    pinned:
      typeof stored.pinned === "boolean" ? stored.pinned : fallback.pinned,
  };
}

export function normalizeColumns(
  def: GridDef,
  stored: unknown,
): ColumnState[] | null {
  if (!Array.isArray(stored)) {
    return null;
  }
  const defaults = defaultColumns(def);
  const known = stored.flatMap((item: unknown) => {
    const candidate = (item ?? {}) as Partial<ColumnState>;
    const fallback = defaults.find((column) => column.key === candidate.key);
    return fallback ? [normalizeColumn(fallback, candidate)] : [];
  });
  const unique = known.filter(
    (column, index) =>
      known.findIndex((other) => other.key === column.key) === index,
  );
  return [
    ...unique,
    ...defaults.filter(
      (column) => !unique.some((other) => other.key === column.key),
    ),
  ];
}

function patchColumn(
  columns: ColumnState[],
  key: string,
  patch: Partial<ColumnState>,
): ColumnState[] {
  return columns.map((column) =>
    column.key === key ? { ...column, ...patch } : column,
  );
}

export function reorderColumns(
  columns: ColumnState[],
  keys: string[],
): ColumnState[] {
  const queue = keys.flatMap(
    (key) => columns.find((column) => column.key === key) ?? [],
  );
  return columns.map((column) =>
    keys.includes(column.key) ? (queue.shift() ?? column) : column,
  );
}

export function layoutColumns(
  def: GridDef,
  columns: ColumnState[],
): GridColumn[] {
  const visible = columns.filter((column) => column.visible);
  const ordered = [
    ...visible.filter((column) => column.pinned),
    ...visible.filter((column) => !column.pinned),
  ];
  let left = 0;
  return ordered.flatMap((column) => {
    const field = def.fields.find((item) => item.key === column.key);
    if (!field) {
      return [];
    }
    const placed = {
      field,
      width: column.width,
      pinned: column.pinned,
      left: column.pinned ? left : 0,
    };
    left += column.pinned ? column.width : 0;
    return [placed];
  });
}

export function createLocalStoragePersistence(
  storageKey: string,
): ColumnPersistence {
  return {
    load: () => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        return raw ? (JSON.parse(raw) as unknown) : null;
      } catch {
        return null;
      }
    },
    save: (columns) => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(columns));
      } catch {
        return;
      }
    },
  };
}

export function createColumnStore(
  def: GridDef,
  persistence: ColumnPersistence | null,
): ColumnStore {
  let columns = defaultColumns(def);
  let restored = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const emitter = createEmitter();
  const set = (next: ColumnState[]) => {
    columns = next;
    emitter.emit();
    if (!restored || !persistence) {
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => void persistence.save(columns), SAVE_DELAY_MS);
  };
  return {
    getColumns: () => columns,
    subscribe: emitter.add,
    resize: (key, width) =>
      set(patchColumn(columns, key, { width: clampWidth(width) })),
    setVisible: (key, visible) => set(patchColumn(columns, key, { visible })),
    setPinned: (key, pinned) => set(patchColumn(columns, key, { pinned })),
    setOrder: (keys) => set(reorderColumns(columns, keys)),
    restore: async () => {
      if (restored) {
        return;
      }
      const stored = normalizeColumns(def, await persistence?.load());
      restored = true;
      if (stored) {
        set(stored);
      }
    },
    reset: () => set(defaultColumns(def)),
  };
}
