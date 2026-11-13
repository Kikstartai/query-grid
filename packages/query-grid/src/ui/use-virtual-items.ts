"use client";

import type { VirtualItem, Virtualizer } from "@ui-sdk/core";
import { useSyncExternalStore } from "react";

interface VirtualWindow {
  items: VirtualItem[];
  size: number;
}

export function useVirtualItems(virtual: Virtualizer): VirtualWindow {
  const items = useSyncExternalStore(
    virtual.subscribe,
    virtual.items,
    virtual.items,
  );
  const size = useSyncExternalStore(
    virtual.subscribe,
    virtual.size,
    virtual.size,
  );
  return { items, size };
}
