"use client";

import { Button } from "@ui-sdk/react/button";
import { Input, InputClear, InputGroup } from "@ui-sdk/react/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select";
import { useState, type FormEvent } from "react";

import { getField, listQuickFields } from "../model/field-types.ts";
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
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  SearchIcon,
  XIcon,
} from "./icons.tsx";

interface ControlProps {
  showReason?: boolean;
}

const SORT_UNAVAILABLE =
  "A quick filter result is unordered until every match is loaded: narrow it under the cap to sort.";

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
    label: getField(def, key)?.label ?? key,
    disabled: !offers.sorts.includes(key),
  }));
  return (
    <FieldFrame
      name="sort"
      kind="sort"
      label="Sort"
      offer={{ offered, reason: offered ? null : SORT_UNAVAILABLE }}
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
        <SelectTrigger
          className="qg-select-trigger"
          aria-label="Sort by"
          data-sort="field"
        >
          <span className="qg-select-prefix">Sort</span>
          <SelectValue className="qg-select-value" />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent className="qg-popup qg-select-content">
          {items.map((item) => (
            <SelectItem
              key={item.value}
              className="qg-option"
              value={item.value}
              disabled={item.disabled}
              data-sort-option={item.value}
            >
              {item.label}
              <SelectItemIndicator className="qg-option-indicator">
                <CheckIcon />
              </SelectItemIndicator>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        className="qg-button qg-icon-button"
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
        <SortDirectionIcon descending={descending} />
      </Button>
    </FieldFrame>
  );
}

function SortDirectionIcon({ descending }: { descending: boolean }) {
  if (descending) {
    return <ArrowDownIcon />;
  }
  return <ArrowUpIcon />;
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
    .map((key) => getField(def, key)?.label ?? key)
    .join(", ");
  const apply = (value: string) => {
    if (value.trim().length === 0) {
      dispatch({ type: "clearQuick" });
      return;
    }
    setTooShort(!isValidQuickValue(value));
    if (isValidQuickValue(value)) {
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
        <InputGroup className="qg-input-group">
          <SearchIcon />
          <Input
            className="qg-input qg-quick-input"
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
        className="qg-button qg-button-ghost"
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
  const filterable = def.fields.filter((field) => field.operators.length > 0);
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
