"use client";

import type { ReactNode } from "react";

import {
  explainUnavailable,
  getField,
  getFieldLabel,
  getRange,
  getReservedValue,
  isExcluding,
  labelKey,
  listTextFilterFields,
  listSelectedValues,
  toExcludeValues,
  listFilterFields,
  SEARCH_MAX_LENGTH,
  SEARCH_MIN_LENGTH,
  resolveFilterKind,
  type BaseFieldDef,
  type FieldOption,
} from "@kikstart/query-grid";

import {
  EqualsSelect,
  LookupFilter,
  RangeFilter,
} from "../components/field-filter.tsx";
import {
  FilterBar as BaseFilterBar,
  FilterChips as BaseFilterChips,
  GroupControl as BaseGroupControl,
  SearchFilter as BaseSearchFilter,
  SortControl as BaseSortControl,
} from "../components/filter-bar.tsx";
import { FilterSidebar as BaseFilterSidebar } from "../components/filter-sidebar.tsx";
import {
  MatchToggle as BaseMatchToggle,
  TextFilter as BaseTextFilter,
} from "../components/narrow-filters.tsx";
import {
  useLocale,
  useMessages,
  type QueryGridMessages,
} from "../components/messages.tsx";
import { formatReason } from "../react/query-grid-format.ts";
import {
  useFieldLabels,
  useFilterChips,
  useOfferContext,
  useOfferState,
  useOffers,
  useQueryState,
} from "../react/query-grid-hooks.ts";
import {
  useQueryGridActions,
  useQueryGridMeta,
} from "../react/query-grid-context.tsx";

export interface FieldFilterProps {
  field: BaseFieldDef;
}

export function useFieldOffer(
  key: string,
  kind: "equals" | "range" | "overlap",
) {
  const offer = useOfferState({ kind, field: key });
  return { disabled: !offer.offered, reason: offer.reason };
}

export function useEqualsFilter(key: string) {
  const { def } = useQueryGridMeta();
  const { dispatch } = useQueryGridActions();
  const query = useQueryState();
  const offers = useOffers();
  const field = getField(def, key);
  const chosen = query.equals[key] ?? [];
  const excluded = field !== null && isExcluding(field, chosen);
  const values = field ? listSelectedValues(field, chosen) : chosen;
  const setValues = (next: string[], exclude: boolean) =>
    dispatch({
      type: "setEquals",
      field: key,
      values: exclude ? toExcludeValues(next) : next,
    });
  return {
    values,
    excluded,
    canExclude: offers.exclude.includes(key),
    multiple: excluded || offers.multi.includes(key),
    onValuesChange: (next: string[]) => setValues(next, excluded),
    onExcludedChange: (exclude: boolean) =>
      setValues(
        values.filter(
          (value) => !field || getReservedValue(field, value) === null,
        ),
        exclude,
      ),
  };
}

function withBooleanOptions(
  field: BaseFieldDef,
  messages: QueryGridMessages,
): BaseFieldDef {
  if (field.type !== "boolean" || field.options) {
    return field;
  }
  return {
    ...field,
    options: [
      { value: "true", label: messages.booleanTrue },
      { value: "false", label: messages.booleanFalse },
    ],
  };
}

function BoundEqualsSelect({ field }: FieldFilterProps) {
  const messages = useMessages();
  return (
    <EqualsSelect
      field={withBooleanOptions(field, messages)}
      {...useEqualsFilter(field.key)}
      {...useFieldOffer(field.key, "equals")}
    />
  );
}

function useOverlapFilter(key: string) {
  const { dispatch } = useQueryGridActions();
  const query = useQueryState();
  return {
    values: query.overlaps[key] ?? [],
    multiple: true,
    onValuesChange: (values: string[]) =>
      dispatch({ type: "setOverlap", field: key, values }),
  };
}

function BoundOverlapSelect({ field }: FieldFilterProps) {
  return (
    <EqualsSelect
      kind="overlap"
      field={field}
      {...useOverlapFilter(field.key)}
      {...useFieldOffer(field.key, "overlap")}
    />
  );
}

function BoundOverlapLookup({ field }: FieldFilterProps) {
  const { loadOptions } = useQueryGridActions();
  return (
    <LookupFilter
      kind="overlap"
      field={field}
      {...useOverlapFilter(field.key)}
      {...useFieldOffer(field.key, "overlap")}
      loadOptions={(text, signal) => loadOptions(field.key, text, signal)}
    />
  );
}

// An array cell is empty or it is not: the (empty) choices belong to equality, so the overlap control never lists them.
function BoundOverlapFilter({ field }: FieldFilterProps) {
  const plain = { ...field, nullable: false };
  if (field.options) {
    return <BoundOverlapSelect field={plain} />;
  }
  return <BoundOverlapLookup field={plain} />;
}

function BoundLookupFilter({ field }: FieldFilterProps) {
  const { loadOptions, rememberLabel } = useQueryGridActions();
  const known = useFieldLabels();
  const { values, multiple, onValuesChange } = useEqualsFilter(field.key);
  const equals = { values, multiple, onValuesChange };
  return (
    <LookupFilter
      field={field}
      {...equals}
      {...useFieldOffer(field.key, "equals")}
      loadOptions={(text, signal) => loadOptions(field.key, text, signal)}
      valueLabels={Object.fromEntries(
        equals.values.flatMap((value) => {
          const label = known[labelKey(field.key, value)];
          return label ? [[value, label]] : [];
        }),
      )}
      onOptionPick={(option: FieldOption) =>
        rememberLabel(field.key, option.value, option.label)
      }
    />
  );
}

function BoundRangeFilter({ field }: FieldFilterProps) {
  const { dispatch } = useQueryGridActions();
  const query = useQueryState();
  return (
    <RangeFilter
      field={field}
      range={getRange(query, field.key)}
      onRangeChange={(next) =>
        dispatch(
          next
            ? { type: "setRange", field: field.key, at: 0, ...next }
            : { type: "clearRange", field: field.key, at: 0 },
        )
      }
      {...useFieldOffer(field.key, "range")}
    />
  );
}

export function FieldFilter(props: FieldFilterProps) {
  const { source } = useQueryGridMeta();
  switch (resolveFilterKind(props.field, source.capabilities)) {
    case "lookup":
      return <BoundLookupFilter {...props} />;
    case "equals":
      return <BoundEqualsSelect {...props} />;
    case "range":
      return <BoundRangeFilter {...props} />;
    case "overlap":
      return <BoundOverlapFilter {...props} />;
    default:
      return null;
  }
}

export function SortControl() {
  const { def } = useQueryGridMeta();
  const messages = useMessages();
  const locale = useLocale();
  const query = useQueryState();
  const context = useOfferContext();
  const offers = useOffers();
  const { dispatch } = useQueryGridActions();
  const offered = offers.sorts.length > 0;
  return (
    <BaseSortControl
      options={context.capabilities.sortFields.map((key) => ({
        value: key,
        label: getFieldLabel(def, key),
        disabled: !offers.sorts.includes(key),
      }))}
      value={query.sort.field}
      direction={query.sort.direction}
      onSortChange={(field, direction) =>
        dispatch({ type: "setSort", field, direction })
      }
      disabled={!offered}
      reason={
        offered
          ? null
          : formatReason(
              messages,
              def,
              explainUnavailable(
                query,
                { kind: "sort", field: query.sort.field },
                context,
              ),
              locale,
            )
      }
    />
  );
}

export function GroupControl() {
  const { def } = useQueryGridMeta();
  const messages = useMessages();
  const locale = useLocale();
  const query = useQueryState();
  const context = useOfferContext();
  const offers = useOffers();
  const { dispatch } = useQueryGridActions();
  const fields = context.capabilities.groupFields;
  if (fields.length === 0) {
    return null;
  }
  return (
    <BaseGroupControl
      options={fields.map((key) => {
        const offered = offers.groups.includes(key) || query.group === key;
        return {
          value: key,
          label: getFieldLabel(def, key),
          disabled: !offered,
          reason: offered
            ? null
            : formatReason(
                messages,
                def,
                explainUnavailable(
                  query,
                  { kind: "group", field: key },
                  context,
                ),
                locale,
              ),
        };
      })}
      value={query.group}
      onGroupChange={(field) => dispatch({ type: "setGroup", field })}
    />
  );
}

export function SearchFilter() {
  const { def } = useQueryGridMeta();
  const query = useQueryState();
  const context = useOfferContext();
  const { dispatch } = useQueryGridActions();
  const offer = useOfferState({ kind: "search" });
  const fields = context.capabilities.searchFields;
  if (fields.length === 0) {
    return null;
  }
  return (
    <BaseSearchFilter
      value={query.search ?? ""}
      onValueChange={(value) =>
        dispatch(value ? { type: "setSearch", value } : { type: "clearSearch" })
      }
      fieldLabels={fields.map((key) => getFieldLabel(def, key))}
      minLength={SEARCH_MIN_LENGTH}
      maxLength={SEARCH_MAX_LENGTH}
      disabled={!offer.offered}
      reason={offer.reason}
    />
  );
}

export interface TextFilterProps {
  fields?: string[];
}

export function TextFilter({ fields }: TextFilterProps) {
  const { def, source } = useQueryGridMeta();
  const query = useQueryState();
  const offers = useOffers();
  const { dispatch } = useQueryGridActions();
  const keys = listTextFilterFields(source.capabilities, fields);
  const offered = keys.filter((key) => offers.texts.includes(key));
  const offer = useOfferState({ kind: "text", field: keys[0] ?? "" });
  if (keys.length === 0) {
    return null;
  }
  const held = offered.length === 0 && query.texts.length === 0;
  return (
    <BaseTextFilter
      options={keys.map((key) => ({
        value: key,
        label: getFieldLabel(def, key),
        disabled: !offered.includes(key),
      }))}
      filters={query.texts}
      onFilterChange={(at, filter) =>
        dispatch(
          filter
            ? { type: "setText", at, ...filter }
            : { type: "removeText", at },
        )
      }
      disabled={held}
      reason={held ? offer.reason : null}
    />
  );
}

export function MatchToggle() {
  const { source } = useQueryGridMeta();
  const query = useQueryState();
  const { dispatch } = useQueryGridActions();
  const offer = useOfferState({ kind: "match" });
  if (!source.capabilities.matchAny) {
    return null;
  }
  return (
    <BaseMatchToggle
      value={query.match}
      onValueChange={(mode) => dispatch({ type: "setMatch", mode })}
      disabled={!offer.offered}
      reason={offer.reason}
    />
  );
}

export function FilterChips() {
  const chips = useFilterChips();
  const { dispatch } = useQueryGridActions();
  return (
    <BaseFilterChips
      chips={chips.map(({ item }) => item)}
      onRemove={(chipId, valueId) => {
        const chip = chips.find(({ item }) => item.id === chipId)?.chip;
        const value =
          chip?.kind === "equals" || chip?.kind === "overlap"
            ? chip.values.find((item) => item.value === valueId)
            : undefined;
        const clear = value?.clear ?? chip?.clear;
        if (clear) {
          dispatch(clear);
        }
      }}
      onReset={() => dispatch({ type: "reset" })}
    />
  );
}

interface DefaultFiltersProps {
  fields?: string[];
  texts?: string[];
}

function DefaultFilters({ fields, texts }: DefaultFiltersProps) {
  const { def, source } = useQueryGridMeta();
  return (
    <>
      <SearchFilter />
      {listFilterFields(def, source.capabilities, fields).map((field) => (
        <FieldFilter key={field.key} field={field} />
      ))}
      <TextFilter fields={texts ?? fields} />
      <MatchToggle />
      <SortControl />
      <GroupControl />
    </>
  );
}

export interface FilterBarProps {
  fields?: string[];
  texts?: string[];
  children?: ReactNode;
}

export function FilterBar({ fields, texts, children }: FilterBarProps) {
  return (
    <BaseFilterBar>
      {children ?? <DefaultFilters fields={fields} texts={texts} />}
    </BaseFilterBar>
  );
}

export interface FilterSidebarProps {
  side?: "start" | "end";
  label?: string;
  fields?: string[];
  texts?: string[];
  children?: ReactNode;
}

export function FilterSidebar({
  side,
  label,
  fields,
  texts,
  children,
}: FilterSidebarProps) {
  const { dispatch } = useQueryGridActions();
  const chips = useFilterChips();
  return (
    <BaseFilterSidebar
      side={side}
      label={label}
      activeCount={chips.filter(({ chip }) => chip.clear !== null).length}
      onReset={() => dispatch({ type: "reset" })}
    >
      {children ?? <DefaultFilters fields={fields} texts={texts} />}
    </BaseFilterSidebar>
  );
}
