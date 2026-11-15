"use client";

import type { ReactNode } from "react";

import {
  explainUnavailable,
  getFieldLabel,
  isLookupField,
  labelKey,
  listFilterFields,
  QUICK_MAX_LENGTH,
  QUICK_MIN_LENGTH,
  type FieldDef,
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
  QuickFilter as BaseQuickFilter,
  SortControl as BaseSortControl,
} from "../components/filter-bar.tsx";
import { FilterSidebar as BaseFilterSidebar } from "../components/filter-sidebar.tsx";
import { useMessages } from "../components/messages.tsx";
import {
  formatReason,
  useFieldLabels,
  useFilterChips,
  useOffers,
  useOfferState,
  useQueryDispatch,
  useQueryGrid,
  useQueryGridActions,
  useQueryRules,
  useQueryState,
} from "../react/query-grid-provider.tsx";

export interface FieldFilterProps {
  field: FieldDef;
}

function useFieldOffer(field: FieldDef, kind: "equals" | "range") {
  const offer = useOfferState({ kind, field: field.key });
  return { disabled: !offer.offered, reason: offer.reason };
}

function useEqualsFilter(field: FieldDef) {
  const { dispatch } = useQueryGridActions();
  const query = useQueryState();
  const offers = useOffers();
  return {
    values: query.equals[field.key] ?? [],
    multiple: offers.multi.includes(field.key),
    onValuesChange: (values: string[]) =>
      dispatch({ type: "setEquals", field: field.key, values }),
  };
}

function BoundEqualsSelect({ field }: FieldFilterProps) {
  return (
    <EqualsSelect
      field={field}
      {...useEqualsFilter(field)}
      {...useFieldOffer(field, "equals")}
    />
  );
}

function BoundLookupFilter({ field }: FieldFilterProps) {
  const { loadOptions, rememberLabel } = useQueryGridActions();
  const known = useFieldLabels();
  const equals = useEqualsFilter(field);
  return (
    <LookupFilter
      field={field}
      {...equals}
      {...useFieldOffer(field, "equals")}
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
  const { def } = useQueryGrid();
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
      format={def.format}
      {...useFieldOffer(field, "range")}
    />
  );
}

export function FieldFilter(props: FieldFilterProps) {
  const { field } = props;
  if (isLookupField(field)) {
    return <BoundLookupFilter {...props} />;
  }
  if (field.operators.includes("eq")) {
    return <BoundEqualsSelect {...props} />;
  }
  if (field.operators.includes("range")) {
    return <BoundRangeFilter {...props} />;
  }
  return null;
}

export function SortControl() {
  const { def } = useQueryGrid();
  const messages = useMessages();
  const query = useQueryState();
  const rules = useQueryRules();
  const offers = useOffers();
  const dispatch = useQueryDispatch();
  const offered = offers.sorts.length > 0;
  return (
    <BaseSortControl
      options={rules.capabilities.sortFields.map((key) => ({
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
                rules,
              ),
            )
      }
    />
  );
}

export function QuickFilter() {
  const { def } = useQueryGrid();
  const query = useQueryState();
  const rules = useQueryRules();
  const dispatch = useQueryDispatch();
  const offer = useOfferState({ kind: "quick" });
  const fields = rules.capabilities.quickFields;
  if (fields.length === 0) {
    return null;
  }
  return (
    <BaseQuickFilter
      value={query.quick ?? ""}
      onValueChange={(value) =>
        dispatch(value ? { type: "setQuick", value } : { type: "clearQuick" })
      }
      fieldLabels={fields.map((key) => getFieldLabel(def, key))}
      minLength={QUICK_MIN_LENGTH}
      maxLength={QUICK_MAX_LENGTH}
      disabled={!offer.offered}
      reason={offer.reason}
    />
  );
}

export function FilterChips() {
  const chips = useFilterChips();
  const dispatch = useQueryDispatch();
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

function DefaultFilters() {
  const { def } = useQueryGrid();
  return (
    <>
      <QuickFilter />
      {listFilterFields(def).map((field) => (
        <FieldFilter key={field.key} field={field} />
      ))}
      <SortControl />
    </>
  );
}

export interface FilterBarProps {
  children?: ReactNode;
}

export function FilterBar({ children = <DefaultFilters /> }: FilterBarProps) {
  return <BaseFilterBar>{children}</BaseFilterBar>;
}

export interface FilterSidebarProps {
  side?: "start" | "end";
  label?: string;
  children?: ReactNode;
}

export function FilterSidebar({
  side,
  label,
  children = <DefaultFilters />,
}: FilterSidebarProps) {
  const dispatch = useQueryDispatch();
  const chips = useFilterChips();
  return (
    <BaseFilterSidebar
      side={side}
      label={label}
      activeCount={chips.filter(({ chip }) => chip.clear !== null).length}
      onReset={() => dispatch({ type: "reset" })}
    >
      {children}
    </BaseFilterSidebar>
  );
}
