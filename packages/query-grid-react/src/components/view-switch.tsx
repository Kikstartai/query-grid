"use client";

import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";

import { useMessages } from "./messages.tsx";
import { useMounted } from "./use-mounted.ts";

export interface ViewOption<V extends string = string> {
  view: V;
  label: string;
}

export interface ViewSwitchProps<V extends string = string> {
  views: ViewOption<V>[];
  value: V;
  onValueChange: (view: V) => void;
}

function ViewSwitchIndicator() {
  // The indicator is measured in the browser, so one in the server HTML would jump to its item on hydration.
  const mounted = useMounted();
  if (!mounted) {
    return null;
  }
  return <SegmentedControlIndicator />;
}

export function ViewSwitch<V extends string = string>({
  views,
  value,
  onValueChange,
}: ViewSwitchProps<V>) {
  const messages = useMessages();
  return (
    <SegmentedControl
      aria-label={messages.view}
      data-part="view-switch"
      value={value}
      onValueChange={(next: string | null) => {
        const option = views.find((item) => item.view === next);
        if (option) {
          onValueChange(option.view);
        }
      }}
    >
      <ViewSwitchIndicator />
      {views.map(({ view, label }) => (
        <SegmentedControlItem key={view} value={view} data-view={view}>
          {label}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}
