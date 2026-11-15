"use client";

import { useAsyncOptions } from "@ui-sdk/react/async-options";
import {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxStatus,
  ComboboxValue,
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
import { useState, type ReactNode } from "react";

import {
  DEFAULT_CURRENCY,
  fromDayBound,
  fromNumberBound,
  toDayBound,
  toNumberBound,
  type BaseFieldDef,
  type FieldOption,
  type GridFormat,
} from "@kikstart/query-grid";

import { FieldFrame } from "./field-frame.tsx";
import type { ControlState } from "./fields.ts";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "./icons.tsx";
import { useMessages } from "./messages.tsx";
import { SelectOption } from "./select-option.tsx";

export interface FieldRange {
  min: string | null;
  max: string | null;
}

export type LoadOptions = (
  text: string,
  signal: AbortSignal,
) => Promise<FieldOption[]>;

interface FilterProps extends ControlState {
  field: BaseFieldDef;
}

export interface EqualsSelectProps extends FilterProps {
  values: string[];
  onValuesChange: (values: string[]) => void;
  multiple?: boolean;
}

export interface LookupFilterProps extends EqualsSelectProps {
  loadOptions: LoadOptions;
  valueLabels?: Record<string, string>;
  onOptionPick?: (option: FieldOption) => void;
}

export interface RangeFilterProps extends FilterProps {
  range: FieldRange | null;
  onRangeChange: (range: FieldRange | null) => void;
  format?: GridFormat;
}

interface FilterFrameProps {
  filter: FilterProps;
  kind: "equals" | "range";
  children: ReactNode;
}

function FilterFrame({ filter, kind, children }: FilterFrameProps) {
  return (
    <FieldFrame
      name={filter.field.key}
      kind={kind}
      label={filter.field.label}
      disabled={filter.disabled}
      reason={filter.reason}
    >
      {children}
    </FieldFrame>
  );
}

const MAX_LABELS = 2;

function toValues(value: string | string[] | null): string[] {
  if (value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function EqualsSelectParts({
  field,
  multiple,
}: Pick<EqualsSelectProps, "field" | "multiple">) {
  const messages = useMessages();
  const label = { label: field.label };
  return (
    <>
      <SelectTrigger
        aria-label={messages.fieldFilter(label)}
        data-filter={field.key}
        data-multiple={multiple ? "" : undefined}
      >
        <span className="qg-select-prefix">{field.label}</span>
        <SelectValue
          maxLabels={MAX_LABELS}
          getMoreLabel={(count) => messages.moreValues({ count })}
        />
      </SelectTrigger>
      <SelectClear
        className="qg-clear"
        aria-label={messages.clearField(label)}
        data-filter-clear={field.key}
      >
        <XIcon size={12} />
      </SelectClear>
      <SelectContent>
        {(field.options ?? []).map((option) => (
          <SelectOption
            key={option.value}
            value={option.value}
            label={option.label}
          />
        ))}
      </SelectContent>
    </>
  );
}

function EqualsControl(props: EqualsSelectProps) {
  const { field, values, disabled, onValuesChange } = props;
  const messages = useMessages();
  if (props.multiple) {
    return (
      <Select
        multiple
        items={field.options ?? []}
        value={values}
        disabled={disabled}
        placeholder={messages.any}
        onValueChange={(next: string[]) => onValuesChange(next)}
      >
        <EqualsSelectParts field={field} multiple />
      </Select>
    );
  }
  return (
    <Select
      items={field.options ?? []}
      value={values[0] ?? null}
      disabled={disabled}
      placeholder={messages.any}
      onValueChange={(next: string | null) => onValuesChange(toValues(next))}
    >
      <EqualsSelectParts field={field} />
    </Select>
  );
}

function useLookup({
  loadOptions,
  onOptionPick,
  onValuesChange,
}: LookupFilterProps) {
  const options = useAsyncOptions<FieldOption>(
    (text, { signal }) => loadOptions(text, signal),
    { debounce: 250, immediate: true },
  );
  const choose = (value: string | string[] | null) => {
    const next = toValues(value);
    for (const option of options.items) {
      if (next.includes(option.value)) {
        onOptionPick?.(option);
      }
    }
    onValuesChange(next);
  };
  return { options, choose };
}

function LookupItems({ items }: { items: FieldOption[] }) {
  const messages = useMessages();
  return (
    <ComboboxContent>
      <ComboboxStatus />
      <ComboboxEmpty>{messages.noMatch}</ComboboxEmpty>
      <ComboboxList>
        {items.map((option) => (
          <ComboboxItem
            key={option.value}
            value={option.value}
            label={option.label}
          >
            {option.label}
            <ComboboxItemIndicator />
          </ComboboxItem>
        ))}
      </ComboboxList>
    </ComboboxContent>
  );
}

function LookupSingle(props: LookupFilterProps) {
  const { field, values, valueLabels = {}, disabled } = props;
  const messages = useMessages();
  const { options, choose } = useLookup(props);
  const current = values[0] ?? null;
  const label = { label: field.label };
  return (
    <Combobox<string>
      key={current ? (valueLabels[current] ?? "") : ""}
      items={options.items}
      filter={false}
      status={options.status}
      value={current}
      disabled={disabled}
      itemToLabel={(value) => valueLabels[value] ?? value}
      onQueryChange={(text: string) => options.setQuery(text)}
      onValueChange={choose}
    >
      <ComboboxInput
        className="qg-combobox-input"
        aria-label={messages.fieldFilter(label)}
        placeholder={messages.searchField(label)}
        data-filter={field.key}
      />
      <ComboboxClear
        className="qg-clear"
        aria-label={messages.clearField(label)}
        data-filter-clear={field.key}
      >
        <XIcon size={12} />
      </ComboboxClear>
      <LookupItems items={options.items} />
    </Combobox>
  );
}

interface LookupChipState {
  value: unknown;
}

function LookupMultiple(props: LookupFilterProps) {
  const { field, values, valueLabels = {}, disabled } = props;
  const messages = useMessages();
  const { options, choose } = useLookup(props);
  const label = { label: field.label };
  return (
    <Combobox<string>
      multiple
      items={options.items}
      filter={false}
      status={options.status}
      value={values}
      disabled={disabled}
      itemToLabel={(value) => valueLabels[value] ?? value}
      onQueryChange={(text: string) => options.setQuery(text)}
      onValueChange={choose}
    >
      <ComboboxChips className="qg-combobox-chips">
        <ComboboxValue>
          {(state: LookupChipState) =>
            toValues(state.value as string[]).map((value) => (
              <ComboboxChip
                key={value}
                value={value}
                className="qg-combobox-chip"
              >
                <bdi>{valueLabels[value] ?? value}</bdi>
                <ComboboxChipRemove
                  className="qg-chip-remove"
                  aria-label={messages.removeChip({
                    label: valueLabels[value] ?? value,
                  })}
                >
                  <XIcon size={12} />
                </ComboboxChipRemove>
              </ComboboxChip>
            ))
          }
        </ComboboxValue>
        <ComboboxInput
          className="qg-combobox-input"
          aria-label={messages.fieldFilter(label)}
          placeholder={messages.searchField(label)}
          data-filter={field.key}
          data-multiple=""
        />
      </ComboboxChips>
      <LookupItems items={options.items} />
    </Combobox>
  );
}

function toDateValue(range: FieldRange | null): [string, string] | null {
  if (!range?.min || !range.max) {
    return null;
  }
  return [fromDayBound(range.min), fromDayBound(range.max)];
}

function DateRange(props: RangeFilterProps) {
  const { field, range, disabled, onRangeChange } = props;
  const messages = useMessages();
  const label = { label: field.label };
  const change = (value: unknown) => {
    if (Array.isArray(value) && value.length === 2) {
      onRangeChange({
        min: toDayBound(String(value[0]), false),
        max: toDayBound(String(value[1]), true),
      });
      return;
    }
    if (range) {
      onRangeChange(null);
    }
  };
  return (
    <DatePicker
      mode="range"
      value={toDateValue(range)}
      disabled={disabled}
      onValueChange={change}
    >
      <div className="qg-range">
        <DatePickerInput
          aria-label={messages.rangeFrom(label)}
          placeholder={range?.min ? fromDayBound(range.min) : messages.from}
          data-filter={`${field.key}.min`}
        />
        <span className="qg-range-dash">–</span>
        <DatePickerInput
          end
          placeholder={range?.max ? fromDayBound(range.max) : messages.to}
          aria-label={messages.rangeTo(label)}
          data-filter={`${field.key}.max`}
        />
        <DatePickerTrigger
          aria-label={messages.pickDates(label)}
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
  );
}

function NumberRange(props: RangeFilterProps) {
  const { field, range, disabled, format, onRangeChange } = props;
  const messages = useMessages();
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
      onRangeChange(null);
      return;
    }
    onRangeChange({
      min: toNumberBound(field, lower),
      max: toNumberBound(field, upper),
    });
  };
  const numberFormat: Intl.NumberFormatOptions | undefined =
    field.type === "money"
      ? { style: "currency", currency: format?.currency ?? DEFAULT_CURRENCY }
      : undefined;
  const label = { label: field.label };
  return (
    <div className="qg-range">
      <NumberInput
        value={min}
        min={0}
        format={numberFormat}
        locale={format?.locale}
        disabled={disabled}
        onValueChange={(value: number | null) => setMin(value)}
        onValueCommit={(value: number | null) => apply(value, max)}
      >
        <NumberInputGroup>
          <NumberInputControl
            className="qg-number-input"
            aria-label={messages.rangeFrom(label)}
            placeholder={messages.min}
            data-filter={`${field.key}.min`}
          />
        </NumberInputGroup>
      </NumberInput>
      <span className="qg-range-dash">–</span>
      <NumberInput
        value={max}
        min={0}
        format={numberFormat}
        locale={format?.locale}
        disabled={disabled}
        onValueChange={(value: number | null) => setMax(value)}
        onValueCommit={(value: number | null) => apply(min, value)}
      >
        <NumberInputGroup>
          <NumberInputControl
            className="qg-number-input"
            aria-label={messages.rangeTo(label)}
            placeholder={messages.max}
            data-filter={`${field.key}.max`}
          />
        </NumberInputGroup>
      </NumberInput>
    </div>
  );
}

function LookupControl(props: LookupFilterProps) {
  if (props.multiple) {
    return <LookupMultiple {...props} />;
  }
  return <LookupSingle {...props} />;
}

function RangeControl(props: RangeFilterProps) {
  if (props.field.type === "datetime") {
    return <DateRange {...props} />;
  }
  return <NumberRange {...props} />;
}

export function EqualsSelect(props: EqualsSelectProps) {
  return (
    <FilterFrame filter={props} kind="equals">
      <EqualsControl {...props} />
    </FilterFrame>
  );
}

export function LookupFilter(props: LookupFilterProps) {
  return (
    <FilterFrame filter={props} kind="equals">
      <LookupControl {...props} />
    </FilterFrame>
  );
}

export function RangeFilter(props: RangeFilterProps) {
  return (
    <FilterFrame filter={props} kind="range">
      <RangeControl {...props} />
    </FilterFrame>
  );
}
