"use client";

import { Button } from "@ui-sdk/react/button";
import { Input, InputClear, InputGroup } from "@ui-sdk/react/input";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select";
import { useState, type FormEvent } from "react";

import {
  getFieldLabel,
  listFilterFields,
  listQuickFields,
} from "../model/field-types.ts";
import { QUICK_UNORDERED_REASON } from "../model/query-actions.ts";
import type { FilterChip } from "../model/format.ts";
import {
  isValidQuickValue,
  QUICK_MAX_LENGTH,
  QUICK_MIN_LENGTH,
} from "../model/query-validate.ts";
import { listSortFields } from "../model/shapes.ts";
import {
  useFilterChips,
  useOffers,
  useQueryDispatch,
  useQueryGrid,
  useQueryRules,
  useQueryState,
} from "../react/query-grid-provider.tsx";
import { FieldFilter, FieldFrame, useOfferState } from "./field-filter.tsx";
import { SelectOption } from "./select-option.tsx";
import { ArrowDownIcon, ArrowUpIcon, XIcon } from "./icons.tsx";

interface ControlProps {
  showReason?: boolean;
}

export function SortControl({ showReason }: ControlProps) {
  const { def } = useQueryGrid();
  const query = useQueryState();
  const rules = useQueryRules();
  const offers = useOffers();
  const dispatch = useQueryDispatch();
  const fields = listSortFields(def, rules.mode);
  const offered = offers.sorts.length > 0;
  const descending = query.sort.direction === "desc";
  const items = fields.map((key) => ({
    value: key,
    label: getFieldLabel(def, key),
    disabled: !offers.sorts.includes(key),
  }));
  return (
    <FieldFrame
      name="sort"
      kind="sort"
      label="Sort"
      offer={{ offered, reason: offered ? null : QUICK_UNORDERED_REASON }}
      showReason={showReason}
    >
      <Select
        items={items}
        value={query.sort.field}
        disabled={!offered}
        onValueChange={(value: string | null) => {
          if (value) {
            dispatch({
              type: "setSort",
              field: value,
              direction: query.sort.direction,
            });
          }
        }}
      >
        <SelectTrigger aria-label="Sort by" data-sort="field">
          <span className="qg-select-prefix">Sort</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
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
        aria-label={descending ? "Descending" : "Ascending"}
        data-sort="direction"
        disabled={!offered}
        onClick={() =>
          dispatch({
            type: "setSort",
            field: query.sort.field,
            direction: descending ? "asc" : "desc",
          })
        }
      >
        {descending ? <ArrowDownIcon /> : <ArrowUpIcon />}
      </Button>
    </FieldFrame>
  );
}

function QuickHint({ show }: { show: boolean }) {
  if (!show) {
    return null;
  }
  return (
    <span className="qg-quick-hint" role="status" data-quick-hint>
      {QUICK_MIN_LENGTH} to {QUICK_MAX_LENGTH} characters
    </span>
  );
}

interface QuickFilterFormProps extends ControlProps {
  current: string;
}

function QuickFilterForm({ current, showReason }: QuickFilterFormProps) {
  const { def } = useQueryGrid();
  const dispatch = useQueryDispatch();
  const offer = useOfferState({ kind: "quick" });
  const [draft, setDraft] = useState(current);
  const [tooShort, setTooShort] = useState(false);
  const labels = listQuickFields(def)
    .map((key) => getFieldLabel(def, key))
    .join(", ");
  const apply = (value: string) => {
    if (value.trim().length === 0) {
      dispatch({ type: "clearQuick" });
      return;
    }
    const valid = isValidQuickValue(value);
    setTooShort(!valid);
    if (valid) {
      dispatch({ type: "setQuick", value: value.trim() });
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
      label="Quick filter"
      offer={offer}
      showReason={showReason}
    >
      <form className="qg-quick" role="search" onSubmit={submit}>
        <InputGroup className="qg-quick-group">
          <Input
            className="qg-quick-input"
            type="search"
            aria-label="Quick filter"
            placeholder={`Quick filter: ${labels}`}
            data-filter="quick"
            value={draft}
            disabled={!offer.offered}
            onChange={(event) => {
              setDraft(event.target.value);
              setTooShort(false);
            }}
          />
          <InputClear
            className="qg-clear"
            aria-label="Clear quick filter"
            data-filter-clear="quick"
            onClick={() => {
              setDraft("");
              apply("");
            }}
          >
            <XIcon size={12} />
          </InputClear>
        </InputGroup>
        <QuickHint show={tooShort} />
      </form>
    </FieldFrame>
  );
}

export function QuickFilter({ showReason }: ControlProps) {
  const { def } = useQueryGrid();
  const query = useQueryState();
  if (listQuickFields(def).length === 0) {
    return null;
  }
  const current = query.quick ?? "";
  return (
    <QuickFilterForm key={current} current={current} showReason={showReason} />
  );
}

function ChipRemove({ chip }: { chip: FilterChip }) {
  const dispatch = useQueryDispatch();
  const clear = chip.clear;
  if (!clear) {
    return null;
  }
  return (
    <Button
      className="qg-chip-remove"
      aria-label={`Remove ${chip.label}`}
      data-chip-remove={chip.id}
      onClick={() => dispatch(clear)}
    >
      <XIcon size={12} />
    </Button>
  );
}

export function FilterChips() {
  const chips = useFilterChips();
  const dispatch = useQueryDispatch();
  const pristine = chips.every((chip) => chip.clear === null);
  return (
    <div
      className="qg-chips"
      role="group"
      aria-label="Active filters and sort"
      data-part="filter-chips"
    >
      {chips.map((chip) => (
        <span
          key={chip.id}
          className="qg-chip"
          data-chip={chip.id}
          data-kind={chip.kind}
        >
          {chip.label}
          <ChipRemove chip={chip} />
        </span>
      ))}
      <Button
        data-chips-reset
        disabled={pristine}
        onClick={() => dispatch({ type: "reset" })}
      >
        Reset
      </Button>
    </div>
  );
}

export function FilterBar() {
  const { def } = useQueryGrid();
  const filterable = listFilterFields(def);
  return (
    <div
      className="qg-filter-bar"
      role="toolbar"
      aria-label="Filters"
      data-part="filter-bar"
    >
      <QuickFilter />
      {filterable.map((field) => (
        <FieldFilter key={field.key} field={field} />
      ))}
      <SortControl />
    </div>
  );
}
