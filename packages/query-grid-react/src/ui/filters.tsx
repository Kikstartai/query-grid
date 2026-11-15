"use client";

import type { ReactNode } from "react";

import {
  explainUnavailable,
  getFieldLabel,
  labelKey,
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
  SearchFilter as BaseSearchFilter,
  SortControl as BaseSortControl,
} from "../components/filter-bar.tsx";
import { FilterSidebar as BaseFilterSidebar } from "../components/filter-sidebar.tsx";
import { useLocale, useMessages } from "../components/messages.tsx";
import {
  formatReason,
  useFieldLabels,
  useFilterChips,
  useOffers,
  useOfferState,
  useQueryGrid,
  useQueryGridActions,
  useOfferContext,
  useQueryState,
} from "../react/query-grid-provider.tsx";

export interface FieldFilterProps {
  field: BaseFieldDef;
}

export function useFieldOffer(key: string, kind: "equals" | "range") {
  const offer = useOfferState({ kind, field: key });
  return { disabled: !offer.offered, reason: offer.reason };
}

export function useEqualsFilter(key: string) {
  const { dispatch } = useQueryGridActions();
  const query = useQueryState();
  const offers = useOffers();
  return {
    values: query.equals[key] ?? [],
    multiple: offers.multi.includes(key),
    onValuesChange: (values: string[]) =>
      dispatch({ type: "setEquals", field: key, values }),
  };
}

function BoundEqualsSelect({ field }: FieldFilterProps) {
  return (
    <EqualsSelect
      field={field}
      {...useEqualsFilter(field.key)}
      {...useFieldOffer(field.key, "equals")}
    />
  );
}

function BoundLookupFilter({ field }: FieldFilterProps) {
  const { loadOptions, rememberLabel } = useQueryGridActions();
  const known = useFieldLabels();
  const equals = useEqualsFilter(field.key);
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
      range={query.range?.field === field.key ? query.range : null}
      onRangeChange={(next) =>
        dispatch(
          next
            ? { type: "setRange", field: field.key, ...next }
            : { type: "clearRange" },
        )
      }
      {...useFieldOffer(field.key, "range")}
    />
  );
}

export function FieldFilter(props: FieldFilterProps) {
  const { source } = useQueryGrid();
  switch (resolveFilterKind(props.field, source.runnable)) {
    case "lookup":
      return <BoundLookupFilter {...props} />;
    case "equals":
      return <BoundEqualsSelect {...props} />;
    case "range":
      return <BoundRangeFilter {...props} />;
    default:
      return null;
  }
}

export function SortControl() {
  const { def } = useQueryGrid();
  const messages = useMessages();
  const locale = useLocale();
  const query = useQueryState();
  const context = useOfferContext();
  const offers = useOffers();
  const { dispatch } = useQueryGridActions();
  const offered = offers.sorts.length > 0;
  return (
    <BaseSortControl
      options={context.runnable.sortFields.map((key) => ({
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

export function SearchFilter() {
  const { def } = useQueryGrid();
  const query = useQueryState();
  const context = useOfferContext();
  const { dispatch } = useQueryGridActions();
  const offer = useOfferState({ kind: "search" });
  const fields = context.runnable.searchFields;
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

export function FilterChips() {
  const chips = useFilterChips();
  const { dispatch } = useQueryGridActions();
  return (
    <BaseFilterChips
      chips={chips.map(({ item }) => item)}
      onRemove={(chipId, valueId) => {
        const chip = chips.find(({ item }) => item.id === chipId)?.chip;
        const value =
          chip?.kind === "equals"
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
}

function DefaultFilters({ fields }: DefaultFiltersProps) {
  const { def, source } = useQueryGrid();
  return (
    <>
      <SearchFilter />
      {listFilterFields(def, source.runnable, fields).map((field) => (
        <FieldFilter key={field.key} field={field} />
      ))}
      <SortControl />
    </>
  );
}

export interface FilterBarProps {
  fields?: string[];
  children?: ReactNode;
}

export function FilterBar({ fields, children }: FilterBarProps) {
  return (
    <BaseFilterBar>
      {children ?? <DefaultFilters fields={fields} />}
    </BaseFilterBar>
  );
}

export interface FilterSidebarProps {
  side?: "start" | "end";
  label?: string;
  fields?: string[];
  children?: ReactNode;
}

export function FilterSidebar({
  side,
  label,
  fields,
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
      {children ?? <DefaultFilters fields={fields} />}
    </BaseFilterSidebar>
  );
}
