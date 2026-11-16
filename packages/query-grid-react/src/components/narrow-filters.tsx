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

import {
  TEXT_FILTER_MAX,
  TEXT_MAX_LENGTH,
  TEXT_OPS,
  type MatchMode,
  type TextOp,
} from "@kikstart/query-grid";

import { FieldFrame } from "./field-frame.tsx";
import type { ControlOption, ControlState } from "./fields.ts";
import { XIcon } from "./icons.tsx";
import { useMessages } from "./messages.tsx";
import { SelectOption } from "./select-option.tsx";
import { useMounted } from "./use-mounted.ts";

export interface TextFilterValue {
  field: string;
  op: TextOp;
  value: string;
}

export interface TextFilterProps extends ControlState {
  options: ControlOption[];
  filters: TextFilterValue[];
  onFilterChange: (at: number, filter: TextFilterValue | null) => void;
  maxLength?: number;
  maxFilters?: number;
}

interface TextRowProps extends ControlState {
  at: number;
  options: ControlOption[];
  filter: TextFilterValue | null;
  maxLength: number;
  onFilterChange: (at: number, filter: TextFilterValue | null) => void;
}

function TextRow({
  at,
  options,
  filter,
  maxLength,
  onFilterChange,
  disabled,
}: TextRowProps) {
  const messages = useMessages();
  const open = options.find((option) => !option.disabled) ?? options[0];
  const [chosen, setChosen] = useState(filter?.field ?? open?.value ?? "");
  const [op, setOp] = useState<TextOp>(filter?.op ?? "contains");
  const [draft, setDraft] = useState(filter?.value ?? "");
  const label = options.find((option) => option.value === chosen)?.label ?? "";
  const ops = TEXT_OPS.map((item) => ({
    value: item as string,
    label: messages.textOps[item],
  }));
  const apply = (field: string, next: TextOp, text: string) => {
    const value = text.trim().slice(0, maxLength);
    if (field && value) {
      onFilterChange(at, { field, op: next, value });
      return;
    }
    if (filter) {
      onFilterChange(at, null);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    apply(chosen, op, draft);
  };
  return (
    <div className="qg-text-row" data-text-row={at}>
      <Select
        items={options}
        value={chosen}
        disabled={disabled}
        onValueChange={(next: string | null) => {
          if (next) {
            setChosen(next);
            apply(next, op, draft);
          }
        }}
      >
        <SelectTrigger aria-label={messages.textField} data-filter="text.field">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectOption
              key={option.value}
              value={option.value}
              label={option.label}
              disabled={option.disabled}
              reason={option.reason}
            />
          ))}
        </SelectContent>
      </Select>
      <Select
        items={ops}
        value={op}
        disabled={disabled}
        onValueChange={(next: string | null) => {
          const picked = TEXT_OPS.find((item) => item === next);
          if (picked) {
            setOp(picked);
            apply(chosen, picked, draft);
          }
        }}
      >
        <SelectTrigger aria-label={messages.textOperator} data-filter="text.op">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ops.map((option) => (
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
            aria-label={messages.textValue({ label, op: messages.textOps[op] })}
            placeholder={messages.textPlaceholder}
            data-filter="text"
            value={draft}
            maxLength={maxLength}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
          />
          <InputClear
            className="qg-clear"
            aria-label={messages.clearField({ label: messages.textFilter })}
            data-filter-clear="text"
            onClick={() => {
              setDraft("");
              apply(chosen, op, "");
            }}
          >
            <XIcon size={12} />
          </InputClear>
        </InputGroup>
      </form>
    </div>
  );
}

function listTextRows(
  filters: TextFilterValue[],
  maxFilters: number,
): (TextFilterValue | null)[] {
  return filters.length < maxFilters ? [...filters, null] : filters;
}

function textRowKey(at: number, filter: TextFilterValue | null): string {
  return filter
    ? `${at}:${filter.field}:${filter.op}:${filter.value}`
    : `${at}:`;
}

export function TextFilter({
  options,
  filters,
  onFilterChange,
  maxLength = TEXT_MAX_LENGTH,
  maxFilters = TEXT_FILTER_MAX,
  disabled,
  reason,
}: TextFilterProps) {
  const messages = useMessages();
  return (
    <FieldFrame
      name="text"
      kind="text"
      label={messages.textFilter}
      disabled={disabled}
      reason={reason}
    >
      <div className="qg-text-rows">
        {listTextRows(filters, maxFilters).map((filter, at) => (
          <TextRow
            key={textRowKey(at, filter)}
            at={at}
            options={options}
            filter={filter}
            maxLength={maxLength}
            onFilterChange={onFilterChange}
            disabled={disabled && filter === null}
          />
        ))}
      </div>
    </FieldFrame>
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
