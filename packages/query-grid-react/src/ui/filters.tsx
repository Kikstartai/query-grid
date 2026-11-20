"use client";

import type { ReactNode } from "react";

import {
  explainUnavailable,
  getFieldFilter,
  getFieldLabel,
  hasFixedValues,
  labelKey,
  listFilterFields,
  listThenBy,
  resolveFieldKind,
  SEARCH_MAX_LENGTH,
  SEARCH_MIN_LENGTH,
  type BaseFieldDef,
  type FieldOption,
  type Filter,
} from "@kikstart/query-grid";

import { CombineToggle as BaseCombineToggle } from "../components/combine-toggle.tsx";
import {
  FieldFilter as BaseFieldFilter,
  type FilterOpOption,
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

export function useFilterOps(key: string): FilterOpOption[] {
  const { def } = useQueryGridMeta();
  const messages = useMessages();
  const locale = useLocale();
  const offers = useOffers();
  return (offers.filters[key] ?? []).map((offer) => ({
    op: offer.op,
    disabled: !offer.offered,
    reason: offer.reason
      ? formatReason(messages, def, offer.reason, locale)
      : null,
    minLength: offer.minLength,
  }));
}

export function useFieldFilter(key: string) {
  const { dispatch } = useQueryGridActions();
  const query = useQueryState();
  const offers = useOffers();
  const ops = useFilterOps(key);
  const filter = getFieldFilter(query, key);
  const held = filter === null && ops.every((item) => item.disabled);
  return {
    ops,
    filter,
    multiple: offers.multi.includes(key),
    disabled: held,
    reason: held ? (ops[0]?.reason ?? null) : null,
    onFilterChange: (next: Filter | null) =>
      dispatch(
        next
          ? { type: "setFilter", filter: next, at: 0 }
          : { type: "removeFilter", field: key, at: 0 },
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

function isLookupField(field: BaseFieldDef): boolean {
  const kind = resolveFieldKind(field);
  return (kind === "choice" || kind === "array") && !hasFixedValues(field);
}

function BoundChoiceFilter({ field }: FieldFilterProps) {
  const messages = useMessages();
  return (
    <BaseFieldFilter
      field={withBooleanOptions(field, messages)}
      {...useFieldFilter(field.key)}
    />
  );
}

function BoundLookupFilter({ field }: FieldFilterProps) {
  const { loadOptions, rememberLabel } = useQueryGridActions();
  const known = useFieldLabels();
  const bound = useFieldFilter(field.key);
  const values =
    bound.filter && "values" in bound.filter ? bound.filter.values : [];
  return (
    <BaseFieldFilter
      field={field}
      {...bound}
      loadOptions={(text, signal) => loadOptions(field.key, text, signal)}
      valueLabels={Object.fromEntries(
        values.flatMap((value) => {
          const label =
            value === null ? null : known[labelKey(field.key, value)];
          return value !== null && label ? [[value, label]] : [];
        }),
      )}
      onOptionPick={(option: FieldOption) =>
        rememberLabel(field.key, option.value, option.label)
      }
    />
  );
}

export function FieldFilter(props: FieldFilterProps) {
  if (isLookupField(props.field)) {
    return <BoundLookupFilter {...props} />;
  }
  return <BoundChoiceFilter {...props} />;
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
        dispatch(
          listThenBy(query).length > 0 && field === query.sort.field
            ? { type: "addSort", field, direction }
            : { type: "setSort", field, direction },
        )
      }
      thenOptions={context.capabilities.thenByFields
        .filter((key) => key !== query.sort.field)
        .map((key) => {
          const held =
            !offers.thenBy.includes(key) &&
            !listThenBy(query).some((sort) => sort.field === key);
          return {
            value: key,
            label: getFieldLabel(def, key),
            disabled: held,
            reason: held
              ? formatReason(
                  messages,
                  def,
                  explainUnavailable(
                    def,
                    query,
                    { kind: "thenBy", field: key },
                    context,
                  ),
                  locale,
                )
              : null,
          };
        })}
      thenBy={listThenBy(query)}
      onSortAdd={(field, direction) =>
        dispatch({ type: "addSort", field, direction })
      }
      onSortRemove={(field) => dispatch({ type: "removeSort", field })}
      disabled={!offered}
      reason={
        offered
          ? null
          : formatReason(
              messages,
              def,
              explainUnavailable(
                def,
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
                  def,
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

export function CombineToggle() {
  const { source } = useQueryGridMeta();
  const query = useQueryState();
  const { dispatch } = useQueryGridActions();
  const offer = useOfferState({ kind: "combine" });
  if (!source.capabilities.combineOr) {
    return null;
  }
  return (
    <BaseCombineToggle
      value={query.combine}
      onValueChange={(combine) => dispatch({ type: "setCombine", combine })}
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
          chip?.kind === "filter"
            ? chip.values.find((item) => (item.value ?? "") === valueId)
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
  const { def, source } = useQueryGridMeta();
  return (
    <>
      <SearchFilter />
      {listFilterFields(def, source.capabilities, fields).map((field) => (
        <FieldFilter key={field.key} field={field} />
      ))}
      <CombineToggle />
      <SortControl />
      <GroupControl />
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
