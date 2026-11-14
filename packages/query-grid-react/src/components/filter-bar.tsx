"use client";

import { Button } from "@ui-sdk/react/button";
import { Input, InputClear, InputGroup } from "@ui-sdk/react/input";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select";
import { useState, type FormEvent, type ReactNode } from "react";

import type { SortDirection } from "@kikstart/query-grid";

import { FieldFrame } from "./field-frame.tsx";
import type { ControlOption, ControlState } from "./fields.ts";
import { ArrowDownIcon, ArrowUpIcon, XIcon } from "./icons.tsx";
import { useMessages } from "./messages.tsx";
import { SelectOption } from "./select-option.tsx";

export interface SortControlProps extends ControlState {
  options: ControlOption[];
  value: string;
  direction: SortDirection;
  onSortChange: (field: string, direction: SortDirection) => void;
}

export function SortControl({
  options,
  value,
  direction,
  onSortChange,
  disabled,
  reason,
  showReason,
}: SortControlProps) {
  const messages = useMessages();
  const descending = direction === "desc";
  return (
    <FieldFrame
      name="sort"
      kind="sort"
      label={messages.sort}
      disabled={disabled}
      reason={reason}
      showReason={showReason}
    >
      <Select
        items={options}
        value={value}
        disabled={disabled}
        onValueChange={(next: string | null) => {
          if (next) {
            onSortChange(next, direction);
          }
        }}
      >
        <SelectTrigger aria-label={messages.sortBy} data-sort="field">
          <span className="qg-select-prefix">{messages.sort}</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((item) => (
            <SelectOption
              key={item.value}
              value={item.value}
              label={item.label}
              disabled={item.disabled}
            />
          ))}
        </SelectContent>
      </Select>
      <Button
        aria-label={descending ? messages.descending : messages.ascending}
        data-sort="direction"
        disabled={disabled}
        onClick={() => onSortChange(value, descending ? "asc" : "desc")}
      >
        {descending ? <ArrowDownIcon /> : <ArrowUpIcon />}
      </Button>
    </FieldFrame>
  );
}

export interface QuickFilterProps extends ControlState {
  value: string;
  onValueChange: (value: string) => void;
  fieldLabels?: string[];
  minLength?: number;
  maxLength?: number;
}

interface QuickHintProps {
  show: boolean;
  min: number;
  max: number;
}

function QuickHint({ show, min, max }: QuickHintProps) {
  const messages = useMessages();
  if (!show) {
    return null;
  }
  return (
    <span className="qg-quick-hint" role="status" data-quick-hint>
      {messages.quickHint({ min, max })}
    </span>
  );
}

function QuickFilterForm({
  value,
  onValueChange,
  fieldLabels = [],
  minLength = 1,
  maxLength = 200,
  disabled,
  reason,
  showReason,
}: QuickFilterProps) {
  const messages = useMessages();
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const apply = (text: string) => {
    const length = text.trim().length;
    if (length === 0) {
      onValueChange("");
      return;
    }
    const valid = length >= minLength && length <= maxLength;
    setInvalid(!valid);
    if (valid) {
      onValueChange(text.trim());
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    apply(draft);
  };
  return (
    <FieldFrame
      name="quick"
      kind="quick"
      label={messages.quickFilter}
      disabled={disabled}
      reason={reason}
      showReason={showReason}
    >
      <form className="qg-quick" role="search" onSubmit={submit}>
        <InputGroup className="qg-quick-group">
          <Input
            className="qg-quick-input"
            type="search"
            aria-label={messages.quickFilter}
            placeholder={messages.quickPlaceholder({
              fields: fieldLabels.join(", "),
            })}
            data-filter="quick"
            value={draft}
            disabled={disabled}
            onChange={(event) => {
              setDraft(event.target.value);
              setInvalid(false);
            }}
          />
          <InputClear
            className="qg-clear"
            aria-label={messages.clearQuickFilter}
            data-filter-clear="quick"
            onClick={() => {
              setDraft("");
              apply("");
            }}
          >
            <XIcon size={12} />
          </InputClear>
        </InputGroup>
        <QuickHint show={invalid} min={minLength} max={maxLength} />
      </form>
    </FieldFrame>
  );
}

export function QuickFilter(props: QuickFilterProps) {
  return <QuickFilterForm key={props.value} {...props} />;
}

export interface ChipValueItem {
  id: string;
  label: string;
}

export interface ChipItem {
  id: string;
  kind: string;
  label: string;
  values?: ChipValueItem[];
  removable: boolean;
}

export interface FilterChipsProps {
  chips: ChipItem[];
  onRemove: (chipId: string, valueId?: string) => void;
  onReset: () => void;
}

interface ChipRemoveProps {
  chip: ChipItem;
  value?: ChipValueItem;
  onRemove: FilterChipsProps["onRemove"];
}

function ChipRemove({ chip, value, onRemove }: ChipRemoveProps) {
  const messages = useMessages();
  if (!chip.removable) {
    return null;
  }
  return (
    <Button
      className="qg-chip-remove"
      aria-label={messages.removeChip({
        label: value ? `${chip.label} ${value.label}` : chip.label,
      })}
      data-chip-remove={chip.id}
      data-chip-value={value?.id}
      onClick={() => onRemove(chip.id, value?.id)}
    >
      <XIcon size={12} />
    </Button>
  );
}

function ChipBody({ chip, onRemove }: Omit<ChipRemoveProps, "value">) {
  if (!chip.values) {
    return (
      <>
        {chip.label}
        <ChipRemove chip={chip} onRemove={onRemove} />
      </>
    );
  }
  return (
    <>
      {chip.label}
      {chip.values.map((value) => (
        <span key={value.id} className="qg-chip-value" data-value={value.id}>
          {value.label}
          <ChipRemove chip={chip} value={value} onRemove={onRemove} />
        </span>
      ))}
    </>
  );
}

export function FilterChips({ chips, onRemove, onReset }: FilterChipsProps) {
  const messages = useMessages();
  const pristine = chips.every((chip) => !chip.removable);
  return (
    <div
      className="qg-chips"
      role="group"
      aria-label={messages.activeFilters}
      data-part="filter-chips"
    >
      {chips.map((chip) => (
        <span
          key={chip.id}
          className="qg-chip"
          data-chip={chip.id}
          data-kind={chip.kind}
        >
          <ChipBody chip={chip} onRemove={onRemove} />
        </span>
      ))}
      <Button data-chips-reset disabled={pristine} onClick={onReset}>
        {messages.reset}
      </Button>
    </div>
  );
}

export interface FilterBarProps {
  label?: string;
  children: ReactNode;
}

export function FilterBar({ label, children }: FilterBarProps) {
  const messages = useMessages();
  return (
    <div
      className="qg-filter-bar"
      role="toolbar"
      aria-label={label ?? messages.filters}
      data-part="filter-bar"
    >
      {children}
    </div>
  );
}
