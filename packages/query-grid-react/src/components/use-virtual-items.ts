"use client";

import type { VirtualItem, Virtualizer } from "@ui-sdk/core";

import { useStoreValue } from "./use-store-value.ts";

interface VirtualWindow {
  items: VirtualItem[];
  size: number;
}

export function useVirtualItems(virtual: Virtualizer): VirtualWindow {
  return {
    items: useStoreValue(virtual.subscribe, virtual.items),
    size: useStoreValue(virtual.subscribe, virtual.size),
  };
}
