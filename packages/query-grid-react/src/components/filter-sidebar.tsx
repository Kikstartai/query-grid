"use client";

import { Button } from "@ui-sdk/react/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@ui-sdk/react/drawer";
import type { ReactNode } from "react";

import { ReasonDisplayContext } from "./field-frame.tsx";
import { SlidersIcon, XIcon } from "./icons.tsx";
import { useMessages } from "./messages.tsx";

export interface FilterSidebarProps {
  side?: "start" | "end";
  label?: string;
  activeCount: number;
  onReset: () => void;
  children: ReactNode;
}

export function FilterSidebar({
  side = "end",
  label,
  activeCount,
  onReset,
  children,
}: FilterSidebarProps) {
  const messages = useMessages();
  const title = label ?? messages.filters;
  return (
    <Drawer side={side} modal={false} closeOnOutsidePress={false}>
      <DrawerTrigger
        data-part="filter-sidebar-trigger"
        data-active={activeCount > 0 ? "" : undefined}
      >
        <SlidersIcon />
        {title}
        <span className="qg-count-pill" data-sidebar-active={activeCount}>
          {activeCount}
        </span>
      </DrawerTrigger>
      <DrawerContent className="qg-drawer" data-part="filter-sidebar">
        <header className="qg-drawer-header">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerClose aria-label={messages.closeFilters} data-sidebar-close>
            <XIcon />
          </DrawerClose>
        </header>
        <DrawerDescription>
          <bdi>{messages.filtersDescription}</bdi>
        </DrawerDescription>
        <div className="qg-drawer-body">
          <ReasonDisplayContext value={true}>{children}</ReasonDisplayContext>
        </div>
        <footer className="qg-drawer-footer">
          <Button
            data-sidebar-reset
            disabled={activeCount === 0}
            onClick={onReset}
          >
            {messages.reset}
          </Button>
          <DrawerClose data-variant="solid">{messages.done}</DrawerClose>
        </footer>
      </DrawerContent>
    </Drawer>
  );
}
