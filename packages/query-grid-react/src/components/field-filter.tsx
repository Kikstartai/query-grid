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
import { Input, InputClear, InputGroup } from "@ui-sdk/react/input";
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
import { useState, type FormEvent } from "react";

import {
  convertFilter,
  DATE_PRESETS,
  fromDayBound,
  fromNumberBound,
  getOperatorShape,
  isDatePreset,
  isDateType,
  moneyFormatOptions,
  resolveCurrency,
  resolveFieldKind,
  TEXT_MAX_LENGTH,
  toNumberBound,
  type BaseFieldDef,
  type FieldKind,
  type FieldOption,
  type Filter,
  type FilterOp,
} from "@kikstart/query-grid";

import { FieldFrame } from "./field-frame.tsx";
import type { ControlState } from "./fields.ts";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "./icons.tsx";
import {
  formatOpLabel,
  useCurrency,
  useLocale,
  useMessages,
} from "./messages.tsx";
import { SelectOption } from "./select-option.tsx";

export type LoadOptions = (
  text: string,
  signal: AbortSignal,
) => Promise<FieldOption[]>;

export interface FilterOpOption {
  op: FilterOp;
  disabled?: boolean;
  reason?: string | null;
  minLength?: number;
}

interface ListProps extends ControlState {
  field: BaseFieldDef;
  values: (string | null)[];
  onValuesChange: (values: (string | null)[]) => void;
  multiple?: boolean;
  blank?: boolean;
}

export type EqualsSelectProps = ListProps;

export interface LookupFilterProps extends ListProps {
  loadOptions: LoadOptions;
  valueLabels?: Record<string, string>;
  onOptionPick?: (option: FieldOption) => void;
}

export interface FieldFilterProps extends ControlState {
  field: BaseFieldDef;
  ops: FilterOpOption[];
  filter: Filter | null;
  onFilterChange: (filter: Filter | null) => void;
  loadOptions?: LoadOptions;
  valueLabels?: Record<string, string>;
  onOptionPick?: (option: FieldOption) => void;
}

const MAX_LABELS = 2;
const BLANK_CHOICE = "\u0000blank";
const PREFERRED_OPS: Record<FieldKind, FilterOp> = {
  text: "contains",
  number: "between",
  date: "in_period",
  choice: "any_of",
  array: "any_of",
};

function toChoices(values: (string | null)[]): string[] {
  return values.map((value) => value ?? BLANK_CHOICE);
}

function fromChoices(choices: string[]): (string | null)[] {
  return choices.map((choice) => (choice === BLANK_CHOICE ? null : choice));
}

function toList(value: string | string[] | null): string[] {
  if (value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function listItems(
  field: BaseFieldDef,
  blank: boolean,
  label: string,
): FieldOption[] {
  const options = field.options ?? [];
  return blank ? [{ value: BLANK_CHOICE, label }, ...options] : options;
}

interface ChoicePartsProps {
  field: BaseFieldDef;
  items: FieldOption[];
  multiple?: boolean;
}

function ChoiceParts({ field, items, multiple }: ChoicePartsProps) {
  const messages = useMessages();
  const label = { label: field.label };
  return (
    <>
      <SelectTrigger
        aria-label={messages.fieldFilter(label)}
        data-filter={field.key}
        data-multiple={multiple ? "" : undefined}
      >
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
        {items.map((option) => (
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

export function EqualsSelect({
  field,
  values,
  onValuesChange,
  multiple,
  blank = false,
  disabled,
}: EqualsSelectProps) {
  const messages = useMessages();
  const items = listItems(field, blank, messages.blankValue);
  const choices = toChoices(values);
  if (multiple) {
    return (
      <Select
        multiple
        items={items}
        value={choices}
        disabled={disabled}
        placeholder={messages.any}
        onValueChange={(next: string[]) => onValuesChange(fromChoices(next))}
      >
        <ChoiceParts field={field} items={items} multiple />
      </Select>
    );
  }
  return (
    <Select
      items={items}
      value={choices[0] ?? null}
      disabled={disabled}
      placeholder={messages.any}
      onValueChange={(next: string | null) =>
        onValuesChange(fromChoices(toList(next)))
      }
    >
      <ChoiceParts field={field} items={items} />
    </Select>
  );
}

function useLookup({
  values,
  valueLabels = {},
  blank = false,
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
  const reserved = blank
    ? [{ value: BLANK_CHOICE, label: messages.blankValue }]
    : [];
  const choose = (value: string | string[] | null) => {
    const next = toList(value);
    for (const option of options.items) {
      if (next.includes(option.value)) {
        onOptionPick?.(option);
      }
    }
    onValuesChange(fromChoices(next));
  };
  return {
    status: options.status,
    choices: toChoices(values),
    items: text.trim() === "" ? [...reserved, ...options.items] : options.items,
    labels: {
      ...valueLabels,
      [BLANK_CHOICE]: messages.blankValue,
    } as Record<string, string>,
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
  const { field, disabled } = props;
  const messages = useMessages();
  const lookup = useLookup(props);
  const current = lookup.choices[0] ?? null;
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
  const { field, disabled } = props;
  const messages = useMessages();
  const lookup = useLookup(props);
  const label = { label: field.label };
  return (
    <Combobox<string>
      multiple
      items={lookup.items}
      filter={false}
      status={lookup.status}
      value={lookup.choices}
      disabled={disabled}
      itemToLabel={(value) => lookup.labels[value] ?? value}
      onQueryChange={lookup.setQuery}
      onValueChange={lookup.choose}
    >
      <ComboboxChips className="qg-combobox-chips">
        <ComboboxValue>
          {(state: LookupChipState) =>
            toList(state.value as string[]).map((value) => (
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

export function LookupFilter(props: LookupFilterProps) {
  if (props.multiple) {
    return <LookupMultiple {...props} />;
  }
  return <LookupSingle {...props} />;
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

interface EditorProps extends ControlState {
  field: BaseFieldDef;
  op: FilterOp;
  filter: Filter | null;
  minLength?: number;
  onFilterChange: (filter: Filter | null) => void;
}

function readOne(filter: Filter | null): string | null {
  return filter && "value" in filter ? filter.value : null;
}

function readPair(filter: Filter | null): [string | null, string | null] {
  return filter && "min" in filter ? [filter.min, filter.max] : [null, null];
}

function DateOne({ field, op, filter, disabled, onFilterChange }: EditorProps) {
  const messages = useMessages();
  const label = { label: field.label };
  const value = readOne(filter);
  const change = (next: unknown) =>
    onFilterChange(
      typeof next === "string" && next
        ? ({ field: field.key, op, value: next } as Filter)
        : null,
    );
  return (
    <DatePicker
      value={value === null ? null : fromDayBound(value)}
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

function DatePair({
  field,
  op,
  filter,
  disabled,
  onFilterChange,
}: EditorProps) {
  const messages = useMessages();
  const label = { label: field.label };
  const [min, max] = readPair(filter);
  const change = (next: unknown) =>
    onFilterChange(
      Array.isArray(next) && next.length === 2
        ? ({
            field: field.key,
            op,
            min: String(next[0]),
            max: String(next[1]),
          } as Filter)
        : null,
    );
  return (
    <DatePicker
      mode="range"
      value={min && max ? [fromDayBound(min), fromDayBound(max)] : null}
      disabled={disabled}
      onValueChange={change}
    >
      <div className="qg-range">
        <DatePickerInput
          aria-label={messages.rangeFrom(label)}
          placeholder={messages.from}
          data-filter={`${field.key}.min`}
        />
        <span className="qg-range-dash">–</span>
        <DatePickerInput
          end
          placeholder={messages.to}
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

function useNumberDraft(field: BaseFieldDef, filter: Filter | null) {
  const [first, second] =
    filter && "min" in filter ? readPair(filter) : [readOne(filter), null];
  const key = `${first ?? ""}|${second ?? ""}`;
  const [seen, setSeen] = useState(key);
  const [low, setLow] = useState(fromNumberBound(field, first));
  const [high, setHigh] = useState(fromNumberBound(field, second));
  if (seen !== key) {
    setSeen(key);
    setLow(fromNumberBound(field, first));
    setHigh(fromNumberBound(field, second));
  }
  return { low, high, setLow, setHigh };
}

function NumberOne(props: EditorProps) {
  const { field, op, filter, disabled, onFilterChange } = props;
  const draft = useNumberDraft(field, filter);
  const commit = (next: number | null) => {
    const value = toNumberBound(field, next);
    if (value !== null) {
      onFilterChange({ field: field.key, op, value } as Filter);
      return;
    }
    if (filter) {
      onFilterChange(null);
    }
  };
  return (
    <NumberBound
      field={field}
      part="value"
      value={draft.low}
      disabled={disabled}
      onValueChange={draft.setLow}
      onValueCommit={commit}
    />
  );
}

function NumberPair(props: EditorProps) {
  const { field, op, filter, disabled, onFilterChange } = props;
  const draft = useNumberDraft(field, filter);
  const commit = (low: number | null, high: number | null) => {
    const min = toNumberBound(field, low);
    const max = toNumberBound(field, high);
    if (min !== null && max !== null) {
      onFilterChange({ field: field.key, op, min, max } as Filter);
      return;
    }
    if (filter && min === null && max === null) {
      onFilterChange(null);
    }
  };
  return (
    <div className="qg-range">
      <NumberBound
        field={field}
        part="min"
        value={draft.low}
        disabled={disabled}
        onValueChange={draft.setLow}
        onValueCommit={(value) => commit(value, draft.high)}
      />
      <span className="qg-range-dash">–</span>
      <NumberBound
        field={field}
        part="max"
        value={draft.high}
        disabled={disabled}
        onValueChange={draft.setHigh}
        onValueCommit={(value) => commit(draft.low, value)}
      />
    </div>
  );
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

function TextOne(props: EditorProps) {
  const { field, op, filter, minLength = 1, disabled, onFilterChange } = props;
  const messages = useMessages();
  const value = readOne(filter) ?? "";
  const [seen, setSeen] = useState(value);
  const [draft, setDraft] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const trimmed = draft.trim();
  const short = trimmed.length > 0 && trimmed.length < minLength;
  const apply = (text: string) => {
    const next = text.trim().slice(0, TEXT_MAX_LENGTH);
    if (next.length >= minLength) {
      onFilterChange({ field: field.key, op, value: next } as Filter);
      return;
    }
    if (filter && !next) {
      onFilterChange(null);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    apply(draft);
  };
  return (
    <form className="qg-search" onSubmit={submit}>
      <InputGroup className="qg-search-group">
        <Input
          className="qg-search-input"
          type="search"
          aria-label={messages.textValue({
            label: field.label,
            op: formatOpLabel(messages, field, op),
          })}
          placeholder={messages.textPlaceholder}
          data-filter={`${field.key}.value`}
          value={draft}
          maxLength={TEXT_MAX_LENGTH}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
        />
        <InputClear
          className="qg-clear"
          aria-label={messages.clearField({ label: field.label })}
          data-filter-clear={field.key}
          onClick={() => {
            setDraft("");
            apply("");
          }}
        >
          <XIcon size={12} />
        </InputClear>
      </InputGroup>
      <TextHint min={minLength} shown={short} />
    </form>
  );
}

function PresetSelect({
  field,
  filter,
  disabled,
  onFilterChange,
}: EditorProps) {
  const messages = useMessages();
  const label = { label: field.label };
  const items = DATE_PRESETS.map((preset) => ({
    value: preset as string,
    label: messages.datePresets[preset],
  }));
  const current = filter && "preset" in filter ? filter.preset : null;
  return (
    <Select
      items={items}
      value={current}
      disabled={disabled}
      placeholder={messages.any}
      onValueChange={(next: string | null) =>
        onFilterChange(
          next !== null && isDatePreset(next)
            ? { field: field.key, op: "in_period", preset: next }
            : null,
        )
      }
    >
      <SelectTrigger
        aria-label={messages.presetField(label)}
        data-filter={`${field.key}.preset`}
      >
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
        {items.map((option) => (
          <SelectOption
            key={option.value}
            value={option.value}
            label={option.label}
          />
        ))}
      </SelectContent>
    </Select>
  );
}

interface ListEditorProps extends EditorProps {
  loadOptions?: LoadOptions;
  valueLabels?: Record<string, string>;
  onOptionPick?: (option: FieldOption) => void;
}

function ListEditor(props: ListEditorProps) {
  const { field, op, filter, onFilterChange } = props;
  const values = filter && "values" in filter ? filter.values : [];
  const list = {
    field,
    values,
    disabled: props.disabled,
    multiple: true,
    blank:
      values.includes(null) ||
      (op === "any_of" && field.nullable === true && field.type !== "array"),
    onValuesChange: (next: (string | null)[]) =>
      onFilterChange(
        next.length > 0
          ? ({ field: field.key, op, values: next } as Filter)
          : null,
      ),
  };
  if (field.options || !props.loadOptions) {
    return <EqualsSelect {...list} />;
  }
  return (
    <LookupFilter
      {...list}
      loadOptions={props.loadOptions}
      valueLabels={props.valueLabels}
      onOptionPick={props.onOptionPick}
    />
  );
}

function PairEditor(props: EditorProps) {
  if (isDateType(props.field.type)) {
    return <DatePair {...props} />;
  }
  return <NumberPair {...props} />;
}

function OneEditor(props: EditorProps) {
  if (resolveFieldKind(props.field) === "text") {
    return <TextOne {...props} />;
  }
  if (isDateType(props.field.type)) {
    return <DateOne {...props} />;
  }
  return <NumberOne {...props} />;
}

function ValueEditor(props: ListEditorProps) {
  switch (getOperatorShape(props.op)) {
    case "none":
      return null;
    case "list":
      return <ListEditor {...props} />;
    case "preset":
      return <PresetSelect {...props} />;
    case "pair":
      return <PairEditor {...props} />;
    case "one":
      return <OneEditor {...props} />;
  }
}

interface OpSelectProps extends ControlState {
  field: BaseFieldDef;
  ops: FilterOpOption[];
  op: FilterOp;
  onOpChange: (op: FilterOp) => void;
}

function OpSelect({ field, ops, op, disabled, onOpChange }: OpSelectProps) {
  const messages = useMessages();
  if (ops.length < 2) {
    return null;
  }
  const items = ops.map((item) => ({
    value: item.op as string,
    label: formatOpLabel(messages, field, item.op),
  }));
  return (
    <Select
      items={items}
      value={op}
      disabled={disabled}
      onValueChange={(next: string | null) => {
        const chosen = ops.find((item) => item.op === next);
        if (chosen) {
          onOpChange(chosen.op);
        }
      }}
    >
      <SelectTrigger
        className="qg-op"
        aria-label={messages.opField({ label: field.label })}
        data-filter={`${field.key}.op`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ops.map((item) => (
          <SelectOption
            key={item.op}
            value={item.op}
            label={formatOpLabel(messages, field, item.op)}
            disabled={item.disabled}
            reason={item.disabled ? item.reason : null}
          />
        ))}
      </SelectContent>
    </Select>
  );
}

function resolveDefaultOp(
  field: BaseFieldDef,
  ops: FilterOpOption[],
): FilterOp {
  const open = ops.filter((item) => !item.disabled);
  const preferred = PREFERRED_OPS[resolveFieldKind(field)];
  const pick =
    open.find((item) => item.op === preferred) ??
    open[0] ??
    ops.find((item) => item.op === preferred) ??
    ops[0];
  return pick?.op ?? preferred;
}

export function FieldFilter(props: FieldFilterProps) {
  const { field, ops, filter, disabled, reason, onFilterChange } = props;
  const [picked, setPicked] = useState<FilterOp | null>(null);
  const op = filter?.op ?? picked ?? resolveDefaultOp(field, ops);
  const listed = ops.some((item) => item.op === op)
    ? ops
    : [...ops, { op, disabled: true }];
  const offer = listed.find((item) => item.op === op);
  const chooseOp = (next: FilterOp) => {
    setPicked(next);
    if (getOperatorShape(next) === "none") {
      onFilterChange({ field: field.key, op: next } as Filter);
      return;
    }
    if (filter) {
      onFilterChange(convertFilter(filter, next));
    }
  };
  return (
    <FieldFrame
      name={field.key}
      kind={resolveFieldKind(field)}
      label={field.label}
      disabled={disabled}
      reason={reason}
    >
      <OpSelect
        field={field}
        ops={listed}
        op={op}
        disabled={disabled}
        onOpChange={chooseOp}
      />
      <ValueEditor
        field={field}
        op={op}
        filter={filter}
        minLength={offer?.minLength}
        disabled={disabled || (offer?.disabled === true && filter === null)}
        loadOptions={props.loadOptions}
        valueLabels={props.valueLabels}
        onOptionPick={props.onOptionPick}
        onFilterChange={onFilterChange}
      />
    </FieldFrame>
  );
}
