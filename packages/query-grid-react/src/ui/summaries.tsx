"use client";

import {
  getFacetField,
  listFieldFilters,
  listTotalFields,
  matchesFilter,
} from "@kikstart/query-grid";

import {
  CountDisplay as BaseCountDisplay,
  TotalFooter as BaseTotalFooter,
  type TotalCell,
} from "../components/count-display.tsx";
import { FacetPanel as BaseFacetPanel } from "../components/facet-panel.tsx";
import {
  formatProblemMessage,
  useLocale,
  useMessages,
} from "../components/messages.tsx";
import {
  ViewSwitch as BaseViewSwitch,
  type ViewOption as BaseViewOption,
} from "../components/view-switch.tsx";
import type { GridView } from "@kikstart/query-grid";
import {
  useCountState,
  useFacetState,
  useGridView,
  useOfferContext,
  useQueryState,
  useTotalState,
} from "../react/query-grid-hooks.ts";
import {
  useQueryGridActions,
  useQueryGridMeta,
} from "../react/query-grid-context.tsx";
import { useFilterOps } from "./filters.tsx";

export function CountDisplay() {
  const { requestExact } = useQueryGridActions();
  const state = useCountState();
  return (
    <BaseCountDisplay
      status={state.status}
      value={state.result}
      onRequestExact={requestExact}
    />
  );
}

export function TotalFooter() {
  const { def } = useQueryGridMeta();
  const messages = useMessages();
  const locale = useLocale();
  const state = useTotalState();
  const totals = listTotalFields(def).map((field): TotalCell => {
    const result = state.result.find((item) => item.field === field.key);
    const refused = result && !result.available ? result : null;
    const problem = state.error ?? refused;
    return {
      field,
      value: result?.available ? result : null,
      reason: problem ? formatProblemMessage(messages, problem, locale) : null,
    };
  });
  return <BaseTotalFooter totals={totals} />;
}

export function FacetPanel() {
  const { def } = useQueryGridMeta();
  const messages = useMessages();
  const query = useQueryState();
  const { capabilities } = useOfferContext();
  const facets = useFacetState();
  const key = def.facet?.field ?? "";
  const { dispatch } = useQueryGridActions();
  const anyOf = useFilterOps(key).find((item) => item.op === "any_of");
  const field = getFacetField(def);
  if (!field?.options) {
    return null;
  }
  const own = listFieldFilters(query, key);
  const equals = {
    values:
      own.length === 0
        ? []
        : field.options
            .map((option) => option.value)
            .filter((value) =>
              own.every((filter) => matchesFilter(field, filter, value)),
            ),
    multiple: true,
    onValuesChange: (values: string[]) =>
      dispatch(
        values.length > 0
          ? {
              type: "setFilter",
              filter: { field: key, op: "any_of", values },
              at: 0,
            }
          : { type: "removeFilter", field: key },
      ),
  };
  const offer = {
    disabled: anyOf?.disabled ?? true,
    reason: anyOf?.reason ?? null,
  };
  const counted = capabilities.isFacetCountExact(query);
  const showCounts = counted && facets.loaded;
  const countOf = (value: string) =>
    facets.result.find((item) => item.value === value)?.count ?? 0;
  const shown = counted ? "counter" : "hidden";
  const note = capabilities.facetCountsFollowFilters ? "following" : shown;
  return (
    <BaseFacetPanel
      label={field.label}
      options={field.options.map((option) => ({
        ...option,
        count: showCounts ? countOf(option.value) : null,
      }))}
      {...equals}
      total={
        showCounts
          ? facets.result.reduce((sum, facet) => sum + facet.count, 0)
          : null
      }
      note={messages.facetNotes[note]}
      {...offer}
    />
  );
}

export type ViewOption = BaseViewOption<GridView>;

export interface ViewSwitchProps {
  views: ViewOption[];
}

export function ViewSwitch({ views }: ViewSwitchProps) {
  const { setView } = useQueryGridActions();
  return (
    <BaseViewSwitch
      views={views}
      value={useGridView()}
      onValueChange={setView}
    />
  );
}
