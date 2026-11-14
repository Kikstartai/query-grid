"use client";

import {
  explainUnavailable,
  getFieldLabel,
  isLookupField,
  labelKey,
  listFilterFields,
  QUICK_MAX_LENGTH,
  QUICK_MIN_LENGTH,
  type FieldDef,
} from "@kikstart/query-grid";

import { FieldFilter as BaseFieldFilter } from "../components/field-filter.tsx";
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
  useQueryRules,
  useQueryState,
} from "../react/query-grid-provider.tsx";

export interface FieldFilterProps {
  field: FieldDef;
  showReason?: boolean;
}

interface ControlProps {
  showReason?: boolean;
}

export function FieldFilter({ field, showReason }: FieldFilterProps) {
  const { def, source, labels } = useQueryGrid();
  const query = useQueryState();
  const dispatch = useQueryDispatch();
  const offers = useOffers();
  const known = useFieldLabels();
  const equality = field.operators.includes("eq");
  const offer = useOfferState({
    kind: equality ? "equals" : "range",
    field: field.key,
  });
  const lookup = isLookupField(field);
  const values = query.equals[field.key] ?? [];
  return (
    <BaseFieldFilter
      field={field}
      values={values}
      multiple={offers.multi.includes(field.key)}
      onValuesChange={(next) =>
        dispatch({ type: "setEquals", field: field.key, values: next })
      }
      range={query.range?.field === field.key ? query.range : null}
      onRangeChange={(next) =>
        dispatch(
          next
            ? { type: "setRange", field: field.key, ...next }
            : { type: "clearRange" },
        )
      }
      loadOptions={
        lookup
          ? (text, signal) =>
              source.fetchOptions(field.key, { query: text }, signal)
          : undefined
      }
      valueLabels={Object.fromEntries(
        values.flatMap((value) => {
          const label = known[labelKey(field.key, value)];
          return label ? [[value, label]] : [];
        }),
      )}
      onOptionPick={(option) =>
        labels.remember(field.key, option.value, option.label)
      }
      format={def.format}
      disabled={!offer.offered}
      reason={offer.reason}
      showReason={showReason}
    />
  );
}

export function SortControl({ showReason }: ControlProps) {
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
      showReason={showReason}
    />
  );
}

export function QuickFilter({ showReason }: ControlProps) {
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
      showReason={showReason}
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

export function FilterBar() {
  const { def } = useQueryGrid();
  return (
    <BaseFilterBar>
      <QuickFilter />
      {listFilterFields(def).map((field) => (
        <FieldFilter key={field.key} field={field} />
      ))}
      <SortControl />
    </BaseFilterBar>
  );
}

export interface FilterSidebarProps {
  side?: "start" | "end";
  label?: string;
}

export function FilterSidebar({ side, label }: FilterSidebarProps) {
  const { def } = useQueryGrid();
  const dispatch = useQueryDispatch();
  const chips = useFilterChips();
  return (
    <BaseFilterSidebar
      side={side}
      label={label}
      activeCount={chips.filter(({ chip }) => chip.clear !== null).length}
      onReset={() => dispatch({ type: "reset" })}
    >
      <QuickFilter showReason />
      {listFilterFields(def).map((field) => (
        <FieldFilter key={field.key} field={field} showReason />
      ))}
      <SortControl showReason />
    </BaseFilterSidebar>
  );
}
