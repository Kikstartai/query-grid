"use client";

import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";

import type { Combinator } from "@kikstart/query-grid";

import { FieldFrame } from "./field-frame.tsx";
import type { ControlState } from "./fields.ts";
import { useMessages } from "./messages.tsx";
import { useMounted } from "./use-mounted.ts";

export interface CombineToggleProps extends ControlState {
  value: Combinator;
  onValueChange: (combine: Combinator) => void;
}

function CombineIndicator() {
  // The indicator is measured in the browser, so one in the server HTML would jump to its item on hydration.
  const mounted = useMounted();
  if (!mounted) {
    return null;
  }
  return <SegmentedControlIndicator />;
}

export function CombineToggle({
  value,
  onValueChange,
  disabled,
  reason,
}: CombineToggleProps) {
  const messages = useMessages();
  return (
    <FieldFrame
      name="combine"
      kind="combine"
      label={messages.matchMode}
      disabled={disabled}
      reason={reason}
    >
      <SegmentedControl
        aria-label={messages.matchMode}
        data-filter="combine"
        value={value}
        onValueChange={(next: string | null) => {
          if (next === "and" || next === "or") {
            onValueChange(next);
          }
        }}
      >
        <CombineIndicator />
        <SegmentedControlItem value="and" data-combine="and">
          {messages.matchAll}
        </SegmentedControlItem>
        <SegmentedControlItem
          value="or"
          data-combine="or"
          disabled={disabled && value !== "or"}
        >
          {messages.matchAny}
        </SegmentedControlItem>
      </SegmentedControl>
    </FieldFrame>
  );
}
