import {
  createRovingFocus,
  createTransfer,
  createVirtualizer,
  definePrimitive,
  type TransferDraft,
  type TransferLists,
  type Virtualizer,
} from "@ui-sdk/core";

export const CARD_HEIGHT = 90;
export const CARD_GAP = 8;
const CARD_EXTENT = CARD_HEIGHT + CARD_GAP;

export interface BoardMove {
  id: string;
  from: string;
  to: string;
  index: number;
}

export interface BoardSource {
  statusOf: (id: string) => string | null;
  allows: (from: string, to: string) => boolean;
  loadMore: (list: string) => void;
}

interface BoardOptions {
  source: BoardSource;
  onMove?: (move: BoardMove) => void;
}

interface KeptIndexes {
  ids: string[];
  moving: string | null;
  stop: string | null;
  indexes: number[];
}

interface DragWatch {
  key: string;
  y: number;
  started: boolean;
  dispose: () => void;
}

interface BoardState {
  lists: TransferLists;
  moving: TransferDraft | null;
  stop: string | null;
}

/** @internal */
export const board = definePrimitive({
  name: "query-grid-board",
  options: { source: "value", onMove: "callback" },
  state: (_options: BoardOptions): BoardState => ({
    lists: {},
    moving: null,
    stop: null,
  }),
  api: (context) => {
    const roving = createRovingFocus(context, { slot: "card", key: "stop" });
    const accepts = (key: string, list: string) => {
      const { source } = context.options();
      const from = source.statusOf(key);
      return from !== null && (from === list || source.allows(from, list));
    };
    const transfer = createTransfer(context, {
      key: "lists",
      draft: "moving",
      set: (value, details) => {
        if (details.from === details.to) {
          return false;
        }
        context.store.set({ lists: value });
        context.options().onMove?.({
          id: details.key,
          from: details.from,
          to: details.to,
          index: details.index,
        });
        return true;
      },
      accepts,
    });
    const idsOf = (list: string) =>
      transfer.lists(context.store.get())[list] ?? [];
    const virtuals = new Map<string, Virtualizer>();
    const virtualFor = (list: string): Virtualizer => {
      const existing = virtuals.get(list);
      if (existing) {
        return existing;
      }
      let kept: KeptIndexes = {
        ids: [],
        moving: null,
        stop: null,
        indexes: [],
      };
      const virtual = createVirtualizer({
        count: () => idsOf(list).length,
        estimate: () => CARD_EXTENT,
        key: (index) => idsOf(list)[index] ?? String(index),
        overscan: 4,
        endThreshold: 15,
        keep: () => {
          const state = context.store.get();
          const ids = idsOf(list);
          const moving = state.moving?.key ?? null;
          const fresh =
            kept.ids === ids &&
            kept.moving === moving &&
            kept.stop === state.stop;
          if (!fresh) {
            const indexes = [moving, state.stop].flatMap((key) => {
              const index = key ? ids.indexOf(key) : -1;
              return index < 0 ? [] : [index];
            });
            kept = { ids, moving, stop: state.stop, indexes };
          }
          return kept.indexes;
        },
        onEnd: () => context.options().source.loadMore(list),
      });
      virtuals.set(list, virtual);
      return virtual;
    };
    const revealMoving = () => {
      const moving = context.store.get().moving;
      if (!moving || moving.pointer) {
        return;
      }
      for (const [list, virtual] of virtuals) {
        const index = idsOf(list).indexOf(moving.key);
        if (index >= 0) {
          virtual.scrollToIndex(index);
        }
      }
    };

    const columns = new Map<string, HTMLElement>();
    const columnAt = (x: number) => {
      for (const [list, el] of columns) {
        const rect = el.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right) {
          return list;
        }
      }
      return null;
    };
    const listOf = (lists: TransferLists, key: string) =>
      Object.keys(lists).find((list) => lists[list].includes(key)) ?? null;
    const indexAt = (list: string, y: number) => {
      const el = columns.get(list);
      if (!el) {
        return 0;
      }
      const middle = CARD_GAP + CARD_HEIGHT / 2;
      const offset = y - el.getBoundingClientRect().top + el.scrollTop - middle;
      const index = Math.ceil(offset / CARD_EXTENT);
      return Math.max(0, Math.min(idsOf(list).length - 1, index));
    };

    let refreshed: Partial<BoardState> = {};
    const refreshChanged = () => {
      const state = context.store.get();
      const everyList =
        refreshed.moving !== state.moving || refreshed.stop !== state.stop;
      for (const [list, virtual] of virtuals) {
        if (everyList || refreshed.lists?.[list] !== state.lists[list]) {
          virtual.refresh();
        }
      }
      refreshed = state;
    };

    let watch: DragWatch | null = null;
    const placeDragged = () => {
      const moving = context.store.get().moving;
      if (!watch || !moving?.pointer || moving.key !== watch.key) {
        return;
      }
      watch.started = true;
      const list = listOf(moving.lists, moving.key);
      if (list === null) {
        return;
      }
      const index = indexAt(list, watch.y);
      if (moving.lists[list].indexOf(moving.key) !== index) {
        transfer.moveTo(list, index);
      }
    };
    const watchDrag = (event: PointerEvent, key: string) => {
      watch?.dispose();
      if (
        event.button !== 0 ||
        !event.isPrimary ||
        context.store.get().moving
      ) {
        return;
      }
      const pointerId = event.pointerId;
      const dispose = () => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", release, true);
        window.removeEventListener("pointercancel", release, true);
        watch = null;
      };
      const move = (moved: PointerEvent) => {
        if (watch && moved.pointerId === pointerId) {
          watch.y = moved.clientY;
        }
      };
      const release = (released: PointerEvent) => {
        if (released.pointerId !== pointerId) {
          return;
        }
        const moving = context.store.get().moving;
        const shown =
          moving?.pointer && moving.key === key
            ? listOf(moving.lists, key)
            : undefined;
        const elsewhere =
          shown !== undefined && columnAt(released.clientX) !== shown;
        if (released.type === "pointerup" && elsewhere) {
          transfer.cancel();
        }
        dispose();
      };
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", release, true);
      window.addEventListener("pointercancel", release, true);
      watch = { key, y: event.clientY, started: false, dispose };
    };

    context.onDestroy(
      context.store.subscribe(() => {
        placeDragged();
        if (watch?.started && !context.store.get().moving) {
          watch.dispose();
        }
        refreshChanged();
        revealMoving();
      }),
    );
    context.onDestroy(() => watch?.dispose());

    const bindColumn = (el: HTMLElement, list: string) => {
      columns.set(list, el);
      const cleanups = [
        transfer.bindList(el, list),
        virtualFor(list).connect(el),
      ];
      return () => {
        if (columns.get(list) === el) {
          columns.delete(list);
        }
        cleanups.forEach((cleanup) => cleanup());
      };
    };
    const setList = (list: string, ids: string[]) =>
      context.store.set({
        lists: { ...context.store.get().lists, [list]: ids },
      });
    return {
      roving,
      transfer,
      virtualFor,
      bindColumn,
      watchDrag,
      setList,
    };
  },
  slots: (slot) => ({
    column: slot<{ value: string }, { ids: string[] }>({
      props: { value: "string" },
      state: (state, { key, api }) => ({
        ids: api.transfer.lists(state)[key] ?? [],
      }),
      bind: (el, { api, key }) => api.bindColumn(el, key),
    }),
    card: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { key, props, api }) => ({
        tabindex: api.roving.tabIndex(state, { key, props }),
        "data-moving": api.transfer.moving(state, key) ? "" : undefined,
        "data-dragging": api.transfer.dragging(state, key) ? "" : undefined,
      }),
      on: {
        keydown: (event, { el, api, key }) => {
          if (!api.transfer.keydown(event, key) && el) {
            api.roving.keydown(event, el);
          }
        },
        pointerdown: (event, { api, key }) => {
          api.watchDrag(event, key);
          api.transfer.pointerdown(event, key);
        },
      },
      bind: (el, part) => {
        const cleanups = [
          part.api.roving.bind(el, part),
          part.api.transfer.bindItem(el, part.key),
        ];
        return () => cleanups.forEach((cleanup) => cleanup());
      },
    }),
  }),
});
