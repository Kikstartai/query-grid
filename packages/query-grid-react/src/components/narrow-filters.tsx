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

export interface TextFieldOption extends ControlOption {
  ops?: TextOp[];
  minLength?: number;
}

export interface TextFilterProps extends ControlState {
  options: TextFieldOption[];
  filters: TextFilterValue[];
  onFilterChange: (at: number, filter: TextFilterValue | null) => void;
  maxLength?: number;
  maxFilters?: number;
}

interface TextHintProps {
  min: number;
  shown: boolean;
}

function TextHint({ min, shown }: TextHintProps) {
  const messages = useMessages();
  if (!shown) {
    return null;
  }
  return (
    <span className="qg-search-hint" role="status" data-text-hint>
      <bdi>{messages.textHint({ min })}</bdi>
    </span>
  );
}

function takesOp(option: TextFieldOption | undefined, op: TextOp): boolean {
  return option?.ops === undefined || option.ops.includes(op);
}

function isLongEnough(
  option: TextFieldOption | undefined,
  value: string,
): boolean {
  return value.length >= (option?.minLength ?? 1);
}

function resolveOp(option: TextFieldOption | undefined, op: TextOp): TextOp {
  return takesOp(option, op) ? op : (option?.ops?.[0] ?? op);
}

interface TextRowProps extends ControlState {
  at: number;
  options: TextFieldOption[];
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
  const option = options.find((item) => item.value === chosen);
  const label = option?.label ?? "";
  const ops = TEXT_OPS.map((item) => ({
    value: item as string,
    label: messages.textOps[item],
    disabled: !takesOp(option, item),
    reason: option?.reason,
  }));
  const short = draft.trim().length > 0 && !isLongEnough(option, draft.trim());
  const apply = (field: string, next: TextOp, text: string) => {
    const value = text.trim().slice(0, maxLength);
    const target = options.find((item) => item.value === field);
    const answered = takesOp(target, next) && isLongEnough(target, value);
    if (field && value && answered) {
      onFilterChange(at, { field, op: next, value });
      return;
    }
    if (filter && !value) {
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
            const taken = resolveOp(
              options.find((item) => item.value === next),
              op,
            );
            setChosen(next);
            setOp(taken);
            apply(next, taken, draft);
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
          {ops.map((item) => (
            <SelectOption
              key={item.value}
              value={item.value}
              label={item.label}
              disabled={item.disabled}
              reason={item.disabled ? item.reason : null}
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
        <TextHint min={option?.minLength ?? 1} shown={short} />
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
