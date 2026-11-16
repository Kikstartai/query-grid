import {
  createReorder,
  definePrimitive,
  reorderMessage,
  type ReorderDraft,
  type ReorderMessage,
} from "@ui-sdk/core";

interface RailOptions {
  order: string[];
  disabled?: boolean;
  labelOf?: (id: string) => string | undefined;
  describe?: (message: ReorderMessage) => string;
  onOrderChange?: (order: string[]) => void;
}

interface RailState {
  value: string[];
  moving: ReorderDraft | null;
}

export interface RailView {
  order: string[];
  moving: string | null;
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, at) => id === b[at]);
}

/** @internal */
export const rowRail = definePrimitive({
  name: "query-grid-row-rail",
  options: {
    order: "list",
    disabled: "value",
    labelOf: "callback",
    describe: "callback",
    onOrderChange: "callback",
  },
  state: (options: RailOptions): RailState => ({
    value: options.order,
    moving: null,
  }),
  api: (context) => {
    const reorder = createReorder(context, {
      slot: "handle",
      key: "value",
      draft: "moving",
      set: (value) => {
        context.store.set({ value });
        context.options().onOrderChange?.(value);
        return true;
      },
      disabled: () => context.options().disabled === true,
      label: (key) => context.options().labelOf?.(key),
      message: (message) =>
        context.options().describe?.(message) ?? reorderMessage(message),
    });
    context.onOptions((options) => {
      const { value, moving } = context.store.get();
      if (!moving && !sameOrder(options.order, value)) {
        context.store.set({ value: options.order });
      }
    });
    return { reorder };
  },
  slots: (slot) => ({
    root: slot<object, RailView>({
      state: (state, { api }) => ({
        order: api.reorder.order(state),
        moving: state.moving?.key ?? null,
      }),
    }),
    handle: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { key, api }) => ({
        "data-moving": api.reorder.moving(state, key) ? "" : undefined,
        "data-dragging": api.reorder.dragging(state, key) ? "" : undefined,
        "aria-pressed": api.reorder.moving(state, key) ? "true" : "false",
      }),
      on: {
        keydown: (event, { api, key }) => {
          api.reorder.keydown(event, key);
        },
        pointerdown: (event, { api, key }) =>
          api.reorder.pointerdown(event, key),
      },
      bind: (el, part) => {
        const reveal = () => {
          const moving = part.store.get().moving;
          if (moving && !moving.pointer && moving.key === part.key) {
            requestAnimationFrame(() => {
              el.scrollIntoView({ block: "nearest" });
              el.focus({ preventScroll: true });
            });
          }
        };
        const cleanups = [
          part.api.reorder.bind(el, part),
          part.store.subscribe(reveal),
        ];
        return () => cleanups.forEach((cleanup) => cleanup());
      },
    }),
  }),
});
