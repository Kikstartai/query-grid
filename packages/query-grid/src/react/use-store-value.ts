"use client";

import { useSyncExternalStore } from "react";

import type { Listener } from "../model/emitter.ts";

export function useStoreValue<T>(
  subscribe: (listener: Listener) => () => void,
  get: () => T,
): T {
  return useSyncExternalStore(subscribe, get, get);
}
