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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select";
import { Toggle } from "@ui-sdk/react/toggle";
import { useState, type ReactNode } from "react";

import {
  DATE_PRESETS,
  fromNumberBound,
  fromRangeValue,
  getReservedValue,
  isDateType,
  isPairRangeOp,
  listReservedValues,
  normalizeEqualsValues,
  RANGE_OPS,
  moneyFormatOptions,
  resolveCurrency,
  resolveRangeValue,
  toNumberBound,
  type BaseFieldDef,
  type FieldOption,
  type RangeInput as FieldRange,
  type RangeOp,
  type RangeValue,
} from "@kikstart/query-grid";

import { FieldFrame } from "./field-frame.tsx";
import type { ControlOption, ControlState } from "./fields.ts";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "./icons.tsx";
import {
  formatReservedValue,
  useCurrency,
  useLocale,
  useMessages,
  type QueryGridMessages,
  type SingleRangeOp,
} from "./messages.tsx";
import { SelectOption } from "./select-option.tsx";

export type { FieldRange };

export type LoadOptions = (
  text: string,
  signal: AbortSignal,
) => Promise<FieldOption[]>;

interface FilterProps extends ControlState {
  field: BaseFieldDef;
}

export interface EqualsSelectProps extends FilterProps {
  kind?: "equals" | "overlap";
  values: string[];
  onValuesChange: (values: string[]) => void;
  multiple?: boolean;
  excluded?: boolean;
  canExclude?: boolean;
  onExcludedChange?: (excluded: boolean) => void;
}

export interface LookupFilterProps extends EqualsSelectProps {
  loadOptions: LoadOptions;
  valueLabels?: Record<string, string>;
  onOptionPick?: (option: FieldOption) => void;
}

export interface RangeFilterProps extends FilterProps {
  range: FieldRange | null;
  onRangeChange: (range: FieldRange | null) => void;
  heldOps?: RangeOp[];
  heldReason?: string | null;
}

interface FilterFrameProps {
  filter: FilterProps;
  kind: "equals" | "range" | "overlap";
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

function listReservedOptions(
  field: BaseFieldDef,
  messages: QueryGridMessages,
): FieldOption[] {
  return listReservedValues(field).flatMap((value) => {
    const reserved = getReservedValue(field, value);
    return reserved
      ? [{ value, label: formatReservedValue(messages, reserved) }]
      : [];
  });
}

function ReservedOptions({ options }: { options: FieldOption[] }) {
  if (options.length === 0) {
    return null;
  }
  return (
    <>
      {options.map((option) => (
        <SelectOption
          key={option.value}
          value={option.value}
          label={option.label}
        />
      ))}
      <SelectSeparator />
    </>
  );
}

interface EqualsSelectPartsProps extends Pick<
  EqualsSelectProps,
  "field" | "multiple" | "excluded"
> {
  reserved: FieldOption[];
}

function EqualsSelectParts({
  field,
  multiple,
  excluded,
  reserved,
}: EqualsSelectPartsProps) {
  const messages = useMessages();
  const label = { label: field.label };
  return (
    <>
      <SelectTrigger
        aria-label={messages.fieldFilter(label)}
        data-filter={field.key}
        data-multiple={multiple ? "" : undefined}
      >
        <span className="qg-select-prefix">
          {excluded ? messages.chipExclude(label) : field.label}
        </span>
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
        <ReservedOptions options={reserved} />
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

function ExcludeToggle({
  field,
  values,
  excluded,
  canExclude,
  disabled,
  onExcludedChange,
}: EqualsSelectProps) {
  const messages = useMessages();
  if (!onExcludedChange || (!canExclude && !excluded)) {
    return null;
  }
  return (
    <Toggle
      className="qg-exclude"
      aria-label={messages.excludeField({ label: field.label })}
      title={messages.excludeField({ label: field.label })}
      data-filter-exclude={field.key}
      pressed={excluded ?? false}
      disabled={disabled || values.length === 0}
      onPressedChange={(pressed: boolean) => onExcludedChange(pressed)}
    >
      {messages.excludeMark}
    </Toggle>
  );
}

function EqualsControl(props: EqualsSelectProps) {
  const { field, values, disabled, onValuesChange, excluded } = props;
  const messages = useMessages();
  const reserved = excluded ? [] : listReservedOptions(field, messages);
  const items = [...reserved, ...(field.options ?? [])];
  if (props.multiple) {
    return (
      <Select
        multiple
        items={items}
        value={values}
        disabled={disabled}
        placeholder={messages.any}
        onValueChange={(next: string[]) =>
          onValuesChange(normalizeEqualsValues(field, values, next))
        }
      >
        <EqualsSelectParts
          field={field}
          multiple
          excluded={excluded}
          reserved={reserved}
        />
      </Select>
    );
  }
  return (
    <Select
      items={items}
      value={values[0] ?? null}
      disabled={disabled}
      placeholder={messages.any}
      onValueChange={(next: string | null) => onValuesChange(toValues(next))}
    >
      <EqualsSelectParts
        field={field}
        excluded={excluded}
        reserved={reserved}
      />
    </Select>
  );
}

function useLookup({
  field,
  values,
  valueLabels = {},
  loadOptions,
  onOptionPick,
  onValuesChange,
}: LookupFilterProps) {
  const messages = useMessages();
  const [text, setText] = useState("");
  const options = useAsyncOptions<FieldOption>(
    (query, { signal }) => loadOptions(query, signal),
    { debounce: 250, immediate: true },
  );
  const reserved = listReservedOptions(field, messages);
  const choose = (value: string | string[] | null) => {
    const next = normalizeEqualsValues(field, values, toValues(value));
    for (const option of options.items) {
      if (next.includes(option.value)) {
        onOptionPick?.(option);
      }
    }
    onValuesChange(next);
  };
  return {
    status: options.status,
    items: text.trim() === "" ? [...reserved, ...options.items] : options.items,
    labels: {
      ...valueLabels,
      ...Object.fromEntries(
        reserved.map((option) => [option.value, option.label]),
      ),
    },
    setQuery: (query: string) => {
      setText(query);
      options.setQuery(query);
    },
    choose,
  };
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
  const { field, values, disabled } = props;
  const messages = useMessages();
  const lookup = useLookup(props);
  const current = values[0] ?? null;
  const label = { label: field.label };
  return (
    <Combobox<string>
      key={current ? (lookup.labels[current] ?? "") : ""}
      items={lookup.items}
      filter={false}
      status={lookup.status}
      value={current}
      disabled={disabled}
      itemToLabel={(value) => lookup.labels[value] ?? value}
      onQueryChange={lookup.setQuery}
      onValueChange={lookup.choose}
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
      <LookupItems items={lookup.items} />
    </Combobox>
  );
}

interface LookupChipState {
  value: unknown;
}

function LookupMultiple(props: LookupFilterProps) {
  const { field, values, disabled } = props;
  const messages = useMessages();
  const lookup = useLookup(props);
  const label = { label: field.label };
  return (
    <Combobox<string>
      multiple
      items={lookup.items}
      filter={false}
      status={lookup.status}
      value={values}
      disabled={disabled}
      itemToLabel={(value) => lookup.labels[value] ?? value}
      onQueryChange={lookup.setQuery}
      onValueChange={lookup.choose}
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
                <bdi>{lookup.labels[value] ?? value}</bdi>
                <ComboboxChipRemove
                  className="qg-chip-remove"
                  aria-label={messages.removeChip({
                    label: lookup.labels[value] ?? value,
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
      <LookupItems items={lookup.items} />
    </Combobox>
  );
}

const CUSTOM_RANGE = "custom";
const OP_PREFIX = "op:";
const SINGLE_OPS: SingleRangeOp[] = [
  "eq",
  "neq",
  "lt",
  "lte",
  "gt",
  "gte",
  "not_between",
];

function toPeriod(op: RangeOp | null): string | null {
  if (op === null) {
    return null;
  }
  return op === "between" ? CUSTOM_RANGE : `${OP_PREFIX}${op}`;
}

function fromPeriod(period: string): RangeOp | null {
  if (period === CUSTOM_RANGE) {
    return "between";
  }
  const op = period.slice(OP_PREFIX.length);
  return RANGE_OPS.find((item) => item === op) ?? null;
}

interface OpRangeProps extends RangeFilterProps {
  op: RangeOp;
  value: RangeValue | null;
}

function DateRange(props: RangeFilterProps) {
  const { field, range, disabled, onRangeChange } = props;
  const messages = useMessages();
  const [picked, setPicked] = useState<RangeOp | null>(null);
  const label = { label: field.label };
  const value = resolveRangeValue(field, range, picked);
  const op = range?.preset ? null : (value?.op ?? picked);
  const periods: ControlOption[] = [
    ...DATE_PRESETS.map((preset) => ({
      value: preset as string,
      label: messages.datePresets[preset],
    })),
    { value: CUSTOM_RANGE, label: messages.customRange },
    ...SINGLE_OPS.map((item) => ({
      value: `${OP_PREFIX}${item}`,
      label: messages.dateOps[item],
      disabled: props.heldOps?.includes(item),
      reason: props.heldReason,
    })),
  ];
  const choose = (next: string | null) => {
    const nextOp = next === null ? null : fromPeriod(next);
    setPicked(nextOp);
    if (next !== null && nextOp === null) {
      onRangeChange({ min: null, max: null, preset: next });
      return;
    }
    onRangeChange(
      nextOp !== null && value
        ? fromRangeValue(field, { ...value, op: nextOp })
        : null,
    );
  };
  return (
    <>
      <Select
        items={periods}
        value={range?.preset ?? toPeriod(op)}
        disabled={disabled}
        placeholder={messages.any}
        onValueChange={choose}
      >
        <SelectTrigger
          aria-label={messages.presetField(label)}
          data-filter={`${field.key}.preset`}
        >
          <span className="qg-select-prefix">{field.label}</span>
          <SelectValue />
        </SelectTrigger>
        <SelectClear
          className="qg-clear"
          aria-label={messages.clearField(label)}
          data-filter-clear={field.key}
        >
          <XIcon size={12} />
        </SelectClear>
        <SelectContent>
          {periods.map((option) => (
            <SelectOption
              key={option.value}
              value={option.value}
              label={option.label}
            />
          ))}
        </SelectContent>
      </Select>
      <DateOperand {...props} op={op} value={value} />
    </>
  );
}

interface DateOperandProps extends RangeFilterProps {
  op: RangeOp | null;
  value: RangeValue | null;
}

function DateOperand({ op, ...props }: DateOperandProps) {
  if (op === null) {
    return null;
  }
  if (isPairRangeOp(op)) {
    return <DatePair {...props} op={op} />;
  }
  return <DateSingle {...props} op={op} />;
}

function CalendarParts() {
  return (
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
  );
}

function DatePair({ field, disabled, onRangeChange, op, value }: OpRangeProps) {
  const messages = useMessages();
  const label = { label: field.label };
  const change = (next: unknown) =>
    onRangeChange(
      Array.isArray(next) && next.length === 2
        ? fromRangeValue(field, {
            op,
            first: String(next[0]),
            second: String(next[1]),
          })
        : null,
    );
  return (
    <DatePicker
      mode="range"
      value={value?.first && value.second ? [value.first, value.second] : null}
      disabled={disabled}
      onValueChange={change}
    >
      <div className="qg-range">
        <DatePickerInput
          aria-label={messages.rangeFrom(label)}
          placeholder={value?.first ?? messages.from}
          data-filter={`${field.key}.min`}
        />
        <span className="qg-range-dash">–</span>
        <DatePickerInput
          end
          placeholder={value?.second ?? messages.to}
          aria-label={messages.rangeTo(label)}
          data-filter={`${field.key}.max`}
        />
        <DatePickerTrigger
          aria-label={messages.pickDates(label)}
          data-filter={`${field.key}.calendar`}
        />
      </div>
      <CalendarParts />
    </DatePicker>
  );
}

function DateSingle({
  field,
  disabled,
  onRangeChange,
  op,
  value,
}: OpRangeProps) {
  const messages = useMessages();
  const label = { label: field.label };
  const change = (next: unknown) =>
    onRangeChange(
      typeof next === "string" && next
        ? fromRangeValue(field, { op, first: next, second: null })
        : null,
    );
  return (
    <DatePicker
      value={value?.first ?? null}
      disabled={disabled}
      onValueChange={change}
    >
      <div className="qg-range">
        <DatePickerInput
          aria-label={messages.rangeValue(label)}
          data-filter={`${field.key}.value`}
        />
        <DatePickerTrigger
          aria-label={messages.pickDate(label)}
          data-filter={`${field.key}.calendar`}
        />
      </div>
      <CalendarParts />
    </DatePicker>
  );
}

interface NumberBoundProps {
  field: BaseFieldDef;
  part: "min" | "max" | "value";
  value: number | null;
  disabled?: boolean;
  onValueChange: (value: number | null) => void;
  onValueCommit: (value: number | null) => void;
}

function NumberBound({
  field,
  part,
  value,
  disabled,
  onValueChange,
  onValueCommit,
}: NumberBoundProps) {
  const messages = useMessages();
  const locale = useLocale();
  const currency = useCurrency();
  const label = { label: field.label };
  const names = {
    min: messages.rangeFrom(label),
    max: messages.rangeTo(label),
    value: messages.rangeValue(label),
  };
  const numberFormat: Intl.NumberFormatOptions | undefined =
    field.type === "money"
      ? moneyFormatOptions(resolveCurrency(field, currency))
      : undefined;
  return (
    <NumberInput
      value={value}
      min={0}
      format={numberFormat}
      locale={locale}
      disabled={disabled}
      onValueChange={onValueChange}
      onValueCommit={onValueCommit}
    >
      <NumberInputGroup>
        <NumberInputControl
          className="qg-number-input"
          aria-label={names[part]}
          placeholder={messages[part]}
          data-filter={`${field.key}.${part}`}
        />
      </NumberInputGroup>
    </NumberInput>
  );
}

interface NumberOperandsProps {
  field: BaseFieldDef;
  op: RangeOp;
  first: number | null;
  second: number | null;
  disabled?: boolean;
  onFirstChange: (value: number | null) => void;
  onSecondChange: (value: number | null) => void;
  onCommit: (first: number | null, second: number | null) => void;
}

function NumberOperands({
  field,
  op,
  first,
  second,
  disabled,
  onFirstChange,
  onSecondChange,
  onCommit,
}: NumberOperandsProps) {
  if (!isPairRangeOp(op)) {
    return (
      <NumberBound
        field={field}
        part="value"
        value={first}
        disabled={disabled}
        onValueChange={onFirstChange}
        onValueCommit={(value) => onCommit(value, null)}
      />
    );
  }
  return (
    <>
      <NumberBound
        field={field}
        part="min"
        value={first}
        disabled={disabled}
        onValueChange={onFirstChange}
        onValueCommit={(value) => onCommit(value, second)}
      />
      <span className="qg-range-dash">–</span>
      <NumberBound
        field={field}
        part="max"
        value={second}
        disabled={disabled}
        onValueChange={onSecondChange}
        onValueCommit={(value) => onCommit(first, value)}
      />
    </>
  );
}

function NumberRange(props: RangeFilterProps) {
  const { field, range, disabled, onRangeChange, heldOps, heldReason } = props;
  const messages = useMessages();
  const [picked, setPicked] = useState<RangeOp>("between");
  const value = resolveRangeValue(field, range, picked);
  const op = value?.op ?? picked;
  const rangeKey = `${op}|${value?.first ?? ""}|${value?.second ?? ""}`;
  const [seen, setSeen] = useState(rangeKey);
  const [first, setFirst] = useState(
    fromNumberBound(field, value?.first ?? null),
  );
  const [second, setSecond] = useState(
    fromNumberBound(field, value?.second ?? null),
  );
  if (seen !== rangeKey) {
    setSeen(rangeKey);
    setFirst(fromNumberBound(field, value?.first ?? null));
    setSecond(fromNumberBound(field, value?.second ?? null));
  }
  const apply = (next: RangeOp, lower: number | null, upper: number | null) =>
    onRangeChange(
      fromRangeValue(field, {
        op: next,
        first: toNumberBound(field, lower),
        second: toNumberBound(field, upper),
      }),
    );
  const ops: ControlOption[] = RANGE_OPS.map((item) => ({
    value: item,
    label: messages.rangeOps[item],
    disabled: heldOps?.includes(item),
    reason: heldReason,
  }));
  return (
    <div className="qg-range">
      <Select
        items={ops}
        value={op}
        disabled={disabled}
        onValueChange={(next: string | null) => {
          const chosen = RANGE_OPS.find((item) => item === next);
          if (chosen) {
            setPicked(chosen);
            apply(chosen, first, second);
          }
        }}
      >
        <SelectTrigger
          className="qg-range-op"
          aria-label={messages.rangeOperator({ label: field.label })}
          data-filter={`${field.key}.op`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ops.map((option) => (
            <SelectOption
              key={option.value}
              value={option.value}
              label={option.label}
              disabled={option.disabled}
              reason={option.disabled ? option.reason : null}
            />
          ))}
        </SelectContent>
      </Select>
      <NumberOperands
        field={field}
        op={op}
        first={first}
        second={second}
        disabled={disabled}
        onFirstChange={setFirst}
        onSecondChange={setSecond}
        onCommit={(lower, upper) => apply(op, lower, upper)}
      />
    </div>
  );
}

function LookupControl(props: LookupFilterProps) {
  if (props.multiple) {
    return <LookupMultiple {...props} />;
  }
  return <LookupSingle {...props} />;
}

// A control clears only a range that is there, so an empty control that changes operator sends nothing.
function RangeControl(props: RangeFilterProps) {
  const onRangeChange = (next: FieldRange | null) => {
    if (next || props.range) {
      props.onRangeChange(next);
    }
  };
  if (isDateType(props.field.type)) {
    return <DateRange {...props} onRangeChange={onRangeChange} />;
  }
  return <NumberRange {...props} onRangeChange={onRangeChange} />;
}

export function EqualsSelect(props: EqualsSelectProps) {
  return (
    <FilterFrame filter={props} kind={props.kind ?? "equals"}>
      <ExcludeToggle {...props} />
      <EqualsControl {...props} />
    </FilterFrame>
  );
}

export function LookupFilter(props: LookupFilterProps) {
  return (
    <FilterFrame filter={props} kind={props.kind ?? "equals"}>
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
