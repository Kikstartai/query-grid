"use client";

import { useSyncExternalStore } from "react";

import type { Listener } from "@kikstart/query-grid";

export function useStoreValue<T>(
  subscribe: (listener: Listener) => () => void,
  get: () => T,
): T {
  return useSyncExternalStore(subscribe, get, get);
}
