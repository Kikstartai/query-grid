import { createStore, type BaseFieldDef } from "@kikstart/query-grid";

export const COLUMN_MIN_WIDTH = 60;
export const COLUMN_MAX_WIDTH = 600;
export const COLUMN_DEFAULT_WIDTH = 150;
export const RESIZE_STEP = 10;
export const RESIZE_LARGE_STEP = 50;
const COLUMN_SAVE_DELAY_MS = 200;

export interface ColumnState {
  key: string;
  width: number;
  visible: boolean;
  pinned: boolean;
}

export interface GridColumn<F extends BaseFieldDef = BaseFieldDef> {
  field: F;
  width: number;
  pinned: boolean;
  start: number;
}

export interface ResizeSession {
  key: string;
  startWidth: number;
}

export interface ColumnPersistence {
  load: () => unknown | Promise<unknown>;
  save: (columns: ColumnState[]) => void | Promise<void>;
}

export const NO_PERSISTENCE: ColumnPersistence = {
  load: () => null,
  save: () => undefined,
};

export type ColumnUpdate = (columns: ColumnState[]) => ColumnState[];

export function clampWidth(width: number): number {
  return Math.min(
    COLUMN_MAX_WIDTH,
    Math.max(COLUMN_MIN_WIDTH, Math.round(width)),
  );
}

export function beginResize(key: string, width: number): ResizeSession {
  return { key, startWidth: width };
}

export function resizeWidth(
  session: ResizeSession,
  delta: number,
  rtl = false,
): number {
  return clampWidth(session.startWidth + (rtl ? -delta : delta));
}

export function cancelResize(session: ResizeSession): number {
  return session.startWidth;
}

export function stepWidth(
  width: number,
  key: string,
  large: boolean,
  rtl = false,
): number {
  const step = large ? RESIZE_LARGE_STEP : RESIZE_STEP;
  const shrink = rtl ? "ArrowRight" : "ArrowLeft";
  const grow = rtl ? "ArrowLeft" : "ArrowRight";
  if (key === shrink) {
    return clampWidth(width - step);
  }
  if (key === grow) {
    return clampWidth(width + step);
  }
  return width;
}

export function defaultColumns(fields: BaseFieldDef[]): ColumnState[] {
  return fields.map((field) => ({
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
  fields: BaseFieldDef[],
  stored: unknown,
): ColumnState[] | null {
  if (!Array.isArray(stored)) {
    return null;
  }
  const defaults = defaultColumns(fields);
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

export function patchColumn(
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

export function layoutColumns<F extends BaseFieldDef>(
  fields: F[],
  columns: ColumnState[],
): GridColumn<F>[] {
  const visible = columns.filter((column) => column.visible);
  const ordered = [
    ...visible.filter((column) => column.pinned),
    ...visible.filter((column) => !column.pinned),
  ];
  let start = 0;
  return ordered.flatMap((column) => {
    const field = fields.find((item) => item.key === column.key);
    if (!field) {
      return [];
    }
    const placed = {
      field,
      width: column.width,
      pinned: column.pinned,
      start: column.pinned ? start : 0,
    };
    start += column.pinned ? column.width : 0;
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

export interface ColumnStore {
  getColumns: () => ColumnState[];
  subscribe: (listener: () => void) => () => void;
  setColumns: (columns: ColumnState[]) => void;
  restore: () => Promise<void>;
}

export function createColumnStore(
  fields: BaseFieldDef[],
  persistence: ColumnPersistence,
): ColumnStore {
  const store = createStore(defaultColumns(fields));
  let restored = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const set = (next: ColumnState[]) => {
    store.set(next);
    if (!restored) {
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(
      () => void persistence.save(store.get()),
      COLUMN_SAVE_DELAY_MS,
    );
  };
  return {
    getColumns: store.get,
    subscribe: store.subscribe,
    setColumns: set,
    restore: async () => {
      if (restored) {
        return;
      }
      const stored = normalizeColumns(fields, await persistence.load());
      restored = true;
      if (stored) {
        set(stored);
      }
    },
  };
}
