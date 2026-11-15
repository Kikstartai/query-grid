"use client";

import { Input, InputClear, InputGroup } from "@ui-sdk/react/input";
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select";
import { useState, type FormEvent } from "react";

import { CONTAINS_MAX_LENGTH, type MatchMode } from "@kikstart/query-grid";

import { FieldFrame } from "./field-frame.tsx";
import type { ControlOption, ControlState } from "./fields.ts";
import { XIcon } from "./icons.tsx";
import { useMessages } from "./messages.tsx";
import { SelectOption } from "./select-option.tsx";
import { useMounted } from "./use-mounted.ts";

export interface ContainsFilterProps extends ControlState {
  options: ControlOption[];
  field: string | null;
  value: string;
  onContainsChange: (field: string, value: string) => void;
  maxLength?: number;
}

function ContainsFilterForm({
  options,
  field,
  value,
  onContainsChange,
  maxLength = CONTAINS_MAX_LENGTH,
  disabled,
  reason,
}: ContainsFilterProps) {
  const messages = useMessages();
  const [chosen, setChosen] = useState(field ?? options[0]?.value ?? "");
  const [draft, setDraft] = useState(value);
  const label = options.find((option) => option.value === chosen)?.label ?? "";
  const apply = (target: string, text: string) => {
    const trimmed = text.trim().slice(0, maxLength);
    if (target && (trimmed || value)) {
      onContainsChange(target, trimmed);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    apply(chosen, draft);
  };
  return (
    <FieldFrame
      name="contains"
      kind="contains"
      label={messages.containsFilter}
      disabled={disabled}
      reason={reason}
    >
      <Select
        items={options}
        value={chosen}
        disabled={disabled}
        onValueChange={(next: string | null) => {
          if (next) {
            setChosen(next);
            apply(next, draft);
          }
        }}
      >
        <SelectTrigger
          aria-label={messages.containsField}
          data-filter="contains.field"
        >
          <span className="qg-select-prefix">{messages.containsFilter}</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectOption
              key={option.value}
              value={option.value}
              label={option.label}
            />
          ))}
        </SelectContent>
      </Select>
      <form className="qg-search" onSubmit={submit}>
        <InputGroup className="qg-search-group">
          <Input
            className="qg-search-input"
            type="search"
            aria-label={messages.containsText({ label })}
            placeholder={messages.containsPlaceholder}
            data-filter="contains"
            value={draft}
            maxLength={maxLength}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
          />
          <InputClear
            className="qg-clear"
            aria-label={messages.clearField({ label: messages.containsFilter })}
            data-filter-clear="contains"
            onClick={() => {
              setDraft("");
              apply(chosen, "");
            }}
          >
            <XIcon size={12} />
          </InputClear>
        </InputGroup>
      </form>
    </FieldFrame>
  );
}

export function ContainsFilter(props: ContainsFilterProps) {
  return (
    <ContainsFilterForm
      key={`${props.field ?? ""}:${props.value}`}
      {...props}
    />
  );
}

export interface MatchToggleProps extends ControlState {
  value: MatchMode;
  onValueChange: (mode: MatchMode) => void;
}

function MatchIndicator() {
  // The indicator is measured in the browser, so one in the server HTML would jump to its item on hydration.
  const mounted = useMounted();
  if (!mounted) {
    return null;
  }
  return <SegmentedControlIndicator />;
}

export function MatchToggle({
  value,
  onValueChange,
  disabled,
  reason,
}: MatchToggleProps) {
  const messages = useMessages();
  return (
    <FieldFrame
      name="match"
      kind="match"
      label={messages.matchMode}
      disabled={disabled}
      reason={reason}
    >
      <SegmentedControl
        aria-label={messages.matchMode}
        data-filter="match"
        value={value}
        onValueChange={(next: string | null) => {
          if (next === "all" || next === "any") {
            onValueChange(next);
          }
        }}
      >
        <MatchIndicator />
        <SegmentedControlItem value="all" data-match="all">
          {messages.matchAll}
        </SegmentedControlItem>
        <SegmentedControlItem
          value="any"
          data-match="any"
          disabled={disabled && value !== "any"}
        >
          {messages.matchAny}
        </SegmentedControlItem>
      </SegmentedControl>
    </FieldFrame>
  );
}
