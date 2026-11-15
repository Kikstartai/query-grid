import type { HistoryWrite, QueryStore } from "@kikstart/query-grid";

import {
  encodeStore,
  encodeUrlState,
  readStoreState,
  readUrlState,
  type UrlState,
} from "./url-state.ts";

const PENDING_WRITE_MS = 1000;

interface PendingWrite {
  search: string;
  at: number;
}

export type UrlWriter = (state: UrlState, history: HistoryWrite) => void;

export interface UrlSync {
  connect: () => () => void;
  follow: (search: string) => void;
}

export function createUrlSync(
  store: QueryStore,
  search: string,
  write: UrlWriter,
  now: () => number = Date.now,
): UrlSync {
  let written = search;
  let pending: PendingWrite[] = [];
  return {
    connect: () =>
      store.subscribe(() => {
        const target = encodeStore(store);
        if (target === written) {
          return;
        }
        written = target;
        pending.push({ search: target, at: now() });
        write(readStoreState(store), store.getHistoryWrite());
      }),
    follow: (next) => {
      const fresh = pending.filter(
        (item) => now() - item.at < PENDING_WRITE_MS,
      );
      const echoed = fresh.findIndex((item) => item.search === next);
      pending = echoed < 0 ? [] : fresh.slice(echoed + 1);
      if (echoed >= 0) {
        return;
      }
      const { runnable } = store.getOfferContext();
      const state = readUrlState(store.def, runnable, next);
      const target = encodeUrlState(store.def, runnable, state);
      written = target;
      if (target !== encodeStore(store)) {
        store.replace(state.query, state.view);
      }
      if (target !== next) {
        write(state, "replace");
      }
    },
  };
}
