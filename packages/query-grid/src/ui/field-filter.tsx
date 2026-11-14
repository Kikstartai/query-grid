"use client";

import { useAsyncOptions } from "@ui-sdk/react/async-options";
import {
  Combobox,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxStatus,
} from "@ui-sdk/react/combobox";
import {
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
  DatePicker,
  DatePickerContent,
  DatePickerInput,
  DatePickerTrigger,
} from "@ui-sdk/react/date-picker";
import {
  NumberInput,
  NumberInputControl,
  NumberInputGroup,
} from "@ui-sdk/react/number-input";
import {
  Select,
  SelectClear,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select";
import { useEffect, useState, type ReactNode } from "react";

import type {
  FieldDef,
  FieldOption,
  RangeState,
} from "../model/field-types.ts";
import { labelKey } from "../model/format.ts";
import {
  explainUnavailable,
  type OfferTarget,
} from "../model/query-actions.ts";
import {
  useFieldLabels,
  useOffers,
  useQueryDispatch,
  useQueryGrid,
  useQueryRules,
  useQueryState,
} from "../react/query-grid-provider.tsx";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "./icons.tsx";
import { SelectOption } from "./select-option.tsx";

export interface FieldFilterProps {
  field: FieldDef;
  showReason?: boolean;
}

interface OfferState {
  offered: boolean;
  reason: string | null;
}

export function useOfferState(target: OfferTarget): OfferState {
  const { def } = useQueryGrid();
  const query = useQueryState();
  const rules = useQueryRules();
  const offers = useOffers();
  const offered =
    target.kind === "quick"
      ? offers.quick
      : {
          equals: offers.equals,
          range: offers.ranges,
          sort: offers.sorts,
        }[target.kind].includes(target.field);
  return {
    offered,
    reason: offered ? null : explainUnavailable(def, query, target, rules),
  };
}

interface FieldFrameProps {
  name: string;
  kind: OfferTarget["kind"];
  label: string;
  offer: OfferState;
  showReason?: boolean;
  children: ReactNode;
}

function FieldReason({
  offer,
  showReason,
}: Pick<FieldFrameProps, "offer" | "showReason">) {
  if (!showReason || !offer.reason) {
    return null;
  }
  return (
    <p className="qg-field-reason" data-field-reason>
      {offer.reason}
    </p>
  );
}

export function FieldFrame({
  name,
  kind,
  label,
  offer,
  showReason,
  children,
}: FieldFrameProps) {
  return (
    <div
      className="qg-field"
      data-field={name}
      data-kind={kind}
      data-unavailable={offer.offered ? undefined : ""}
      title={offer.reason ?? undefined}
    >
      <span className="qg-field-label">{label}</span>
      <div className="qg-field-control">{children}</div>
      <FieldReason offer={offer} showReason={showReason} />
    </div>
  );
}

function EqualsSelect({ field, showReason }: FieldFilterProps) {
  const query = useQueryState();
  const dispatch = useQueryDispatch();
  const offer = useOfferState({ kind: "equals", field: field.key });
  const options = field.options ?? [];
  return (
    <FieldFrame
      name={field.key}
      kind="equals"
      label={field.label}
      offer={offer}
      showReason={showReason}
    >
      <Select
        items={options}
        value={query.equals[field.key] ?? null}
        disabled={!offer.offered}
        placeholder="any"
        onValueChange={(value: string | null) =>
          dispatch(
            value
              ? { type: "setEquals", field: field.key, value }
              : { type: "clearEquals", field: field.key },
          )
        }
      >
        <SelectTrigger
          aria-label={`${field.label} filter`}
          data-filter={field.key}
        >
          <span className="qg-select-prefix">{field.label}</span>
          <SelectValue />
        </SelectTrigger>
        <SelectClear
          className="qg-clear"
          aria-label={`Clear ${field.label}`}
          data-filter-clear={field.key}
        >
          <XIcon size={12} />
        </SelectClear>
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
    </FieldFrame>
  );
}

function LookupCombobox({ field, showReason }: FieldFilterProps) {
  const { source, labels } = useQueryGrid();
  const query = useQueryState();
  const dispatch = useQueryDispatch();
  const known = useFieldLabels();
  const offer = useOfferState({ kind: "equals", field: field.key });
  const current = query.equals[field.key] ?? null;
  const options = useAsyncOptions<FieldOption>(
    (text, { signal }) =>
      source.fetchOptions(field.key, { query: text }, signal),
    { debounce: 250, immediate: true },
  );
  useEffect(() => {
    if (current) {
      labels.request(field.key, current);
    }
  }, [labels, field.key, current]);
  const choose = (value: string | null) => {
    const picked = options.items.find((option) => option.value === value);
    if (picked) {
      labels.remember(field.key, picked.value, picked.label);
    }
    dispatch(
      value
        ? { type: "setEquals", field: field.key, value }
        : { type: "clearEquals", field: field.key },
    );
  };
  return (
    <FieldFrame
      name={field.key}
      kind="equals"
      label={field.label}
      offer={offer}
      showReason={showReason}
    >
      <Combobox<string>
        key={current ? (known[labelKey(field.key, current)] ?? "") : ""}
        items={options.items}
        filter={false}
        status={options.status}
        value={current}
        disabled={!offer.offered}
        itemToLabel={(value) => known[labelKey(field.key, value)] ?? value}
        onQueryChange={(text: string) => options.setQuery(text)}
        onValueChange={choose}
      >
        <ComboboxInput
          className="qg-combobox-input"
          aria-label={`${field.label} filter`}
          placeholder={`${field.label}: search…`}
          data-filter={field.key}
        />
        <ComboboxClear
          className="qg-clear"
          aria-label={`Clear ${field.label}`}
          data-filter-clear={field.key}
        >
          <XIcon size={12} />
        </ComboboxClear>
        <ComboboxContent>
          <ComboboxStatus />
          <ComboboxEmpty>No match.</ComboboxEmpty>
          <ComboboxList>
            {options.items.map((option) => (
              <ComboboxItem
                key={option.value}

                value={option.value}
                label={option.label}
              >
                {option.label}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </FieldFrame>
  );
}

function toDayBound(day: string, end: boolean): string {
  return `${day}T${end ? "23:59:59.999999" : "00:00:00.000000"}Z`;
}

function toDateValue(range: RangeState | null): [string, string] | null {
  if (!range?.min || !range.max) {
    return null;
  }
  return [range.min.slice(0, 10), range.max.slice(0, 10)];
}

interface RangeProps extends FieldFilterProps {
  range: RangeState | null;
}

function DateRange({ field, range, showReason }: RangeProps) {
  const dispatch = useQueryDispatch();
  const offer = useOfferState({ kind: "range", field: field.key });
  const change = (value: unknown) => {
    if (Array.isArray(value) && value.length === 2) {
      dispatch({
        type: "setRange",
        field: field.key,
        min: toDayBound(String(value[0]), false),
        max: toDayBound(String(value[1]), true),
      });
      return;
    }
    if (range) {
      dispatch({ type: "clearRange" });
    }
  };
  return (
    <FieldFrame
      name={field.key}
      kind="range"
      label={field.label}
      offer={offer}
      showReason={showReason}
    >
      <DatePicker
        mode="range"
        value={toDateValue(range)}
        disabled={!offer.offered}
        onValueChange={change}
      >
        <div className="qg-range">
          <DatePickerInput
            aria-label={`${field.label} from`}
            placeholder={range?.min?.slice(0, 10) ?? "from"}
            data-filter={`${field.key}.min`}
          />
          <span className="qg-range-dash">–</span>
          <DatePickerInput
            end
            placeholder={range?.max?.slice(0, 10) ?? "to"}
            aria-label={`${field.label} to`}
            data-filter={`${field.key}.max`}
          />
          <DatePickerTrigger
            aria-label={`Pick ${field.label} dates`}
            data-filter={`${field.key}.calendar`}
          />
        </div>
        <DatePickerContent>
          <CalendarPrevious>
            <ChevronLeftIcon />
          </CalendarPrevious>
          <CalendarHeading />
          <CalendarNext>
            <ChevronRightIcon />
          </CalendarNext>
          <CalendarGrid>
            <CalendarWeekdays>
              {(index) => <CalendarWeekday index={index} />}
            </CalendarWeekdays>
            <CalendarWeeks>
              {(cell) => <CalendarDay value={cell.date} />}
            </CalendarWeeks>
          </CalendarGrid>
        </DatePickerContent>
      </DatePicker>
    </FieldFrame>
  );
}

function fromNumberBound(field: FieldDef, bound: string | null): number | null {
  if (bound === null) {
    return null;
  }
  return field.type === "money" ? Number(bound) / 100 : Number(bound);
}

function toNumberBound(field: FieldDef, value: number | null): string | null {
  if (value === null) {
    return null;
  }
  return String(Math.round(field.type === "money" ? value * 100 : value));
}

function NumberRange({ field, range, showReason }: RangeProps) {
  const { def } = useQueryGrid();
  const dispatch = useQueryDispatch();
  const offer = useOfferState({ kind: "range", field: field.key });
  const rangeKey = `${range?.min ?? ""}|${range?.max ?? ""}`;
  const [seen, setSeen] = useState(rangeKey);
  const [min, setMin] = useState(fromNumberBound(field, range?.min ?? null));
  const [max, setMax] = useState(fromNumberBound(field, range?.max ?? null));
  if (seen !== rangeKey) {
    setSeen(rangeKey);
    setMin(fromNumberBound(field, range?.min ?? null));
    setMax(fromNumberBound(field, range?.max ?? null));
  }
  const apply = (lower: number | null, upper: number | null) => {
    if (lower === null && upper === null) {
      dispatch({ type: "clearRange" });
      return;
    }
    dispatch({
      type: "setRange",
      field: field.key,
      min: toNumberBound(field, lower),
      max: toNumberBound(field, upper),
    });
  };
  const format: Intl.NumberFormatOptions | undefined =
    field.type === "money"
      ? { style: "currency", currency: def.format?.currency ?? "USD" }
      : undefined;
  return (
    <FieldFrame
      name={field.key}
      kind="range"
      label={field.label}
      offer={offer}
      showReason={showReason}
    >
      <div className="qg-range">
        <NumberInput
          value={min}
          min={0}
          format={format}
          locale={def.format?.locale}
          disabled={!offer.offered}
          onValueChange={(value: number | null) => setMin(value)}
          onValueCommit={(value: number | null) => apply(value, max)}
        >
          <NumberInputGroup>
            <NumberInputControl
              className="qg-number-input"
              aria-label={`${field.label} from`}
              placeholder="min"
              data-filter={`${field.key}.min`}
            />
          </NumberInputGroup>
        </NumberInput>
        <span className="qg-range-dash">–</span>
        <NumberInput
          value={max}
          min={0}
          format={format}
          locale={def.format?.locale}
          disabled={!offer.offered}
          onValueChange={(value: number | null) => setMax(value)}
          onValueCommit={(value: number | null) => apply(min, value)}
        >
          <NumberInputGroup>
            <NumberInputControl
              className="qg-number-input"
              aria-label={`${field.label} to`}
              placeholder="max"
              data-filter={`${field.key}.max`}
            />
          </NumberInputGroup>
        </NumberInput>
      </div>
    </FieldFrame>
  );
}

function RangeFilter({ field, showReason }: FieldFilterProps) {
  const query = useQueryState();
  const range = query.range?.field === field.key ? query.range : null;
  if (field.type === "datetime") {
    return <DateRange field={field} range={range} showReason={showReason} />;
  }
  return <NumberRange field={field} range={range} showReason={showReason} />;
}

export function FieldFilter({ field, showReason }: FieldFilterProps) {
  if (field.operators.includes("eq") && field.options) {
    return <EqualsSelect field={field} showReason={showReason} />;
  }
  if (field.operators.includes("eq")) {
    return <LookupCombobox field={field} showReason={showReason} />;
  }
  if (field.operators.includes("range")) {
    return <RangeFilter field={field} showReason={showReason} />;
  }
  return null;
}
