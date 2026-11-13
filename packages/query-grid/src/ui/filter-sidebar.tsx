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

import { listFilterFields } from "../model/field-types.ts";
import {
  useFilterChips,
  useQueryDispatch,
  useQueryGrid,
} from "../react/query-grid-provider.tsx";
import { FieldFilter } from "./field-filter.tsx";
import { QuickFilter, SortControl } from "./filter-bar.tsx";
import { SlidersIcon, XIcon } from "./icons.tsx";

interface FilterSidebarProps {
  side?: "left" | "right";
  label?: string;
}

export function FilterSidebar({
  side = "right",
  label = "Filters",
}: FilterSidebarProps) {
  const { def } = useQueryGrid();
  const dispatch = useQueryDispatch();
  const chips = useFilterChips();
  const active = chips.filter((chip) => chip.clear !== null).length;
  const filterable = listFilterFields(def);
  return (
    <Drawer side={side} modal={false} closeOnOutsidePress={false}>
      <DrawerTrigger
        className="qg-button"
        data-part="filter-sidebar-trigger"
        data-active={active > 0 ? "" : undefined}
      >
        <SlidersIcon />
        {label}
        <span className="qg-count-pill" data-sidebar-active={active}>
          {active}
        </span>
      </DrawerTrigger>
      <DrawerContent className="qg-drawer" data-part="filter-sidebar">
        <header className="qg-drawer-header">
          <DrawerTitle className="qg-drawer-title">{label}</DrawerTitle>
          <DrawerClose
            className="qg-button qg-icon-button"
            aria-label="Close filters"
            data-sidebar-close
          >
            <XIcon />
          </DrawerClose>
        </header>
        <DrawerDescription className="qg-drawer-description">
          A control is offered only when an index answers it with the current
          filters and sort. A disabled control says what blocks it.
        </DrawerDescription>
        <div className="qg-drawer-body">
          <QuickFilter showReason />
          {filterable.map((field) => (
            <FieldFilter key={field.key} field={field} showReason />
          ))}
          <SortControl showReason />
        </div>
        <footer className="qg-drawer-footer">
          <Button
            className="qg-button qg-button-ghost"
            data-sidebar-reset
            disabled={active === 0}
            onClick={() => dispatch({ type: "reset" })}
          >
            Reset
          </Button>
          <DrawerClose className="qg-button qg-button-primary">
            Done
          </DrawerClose>
        </footer>
      </DrawerContent>
    </Drawer>
  );
}
