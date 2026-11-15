"use client";

import {
  expandEquals,
  getFacetField,
  listTotalFields,
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
  useQueryGrid,
  useQueryGridActions,
  useOfferContext,
  useQueryState,
  useTotalState,
} from "../react/query-grid-provider.tsx";
import { useEqualsFilter, useFieldOffer } from "./filters.tsx";

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
  const { def } = useQueryGrid();
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
  const { def } = useQueryGrid();
  const messages = useMessages();
  const query = useQueryState();
  const { runnable } = useOfferContext();
  const facets = useFacetState();
  const key = def.facet?.field ?? "";
  const { multiple } = useEqualsFilter(key);
  const { dispatch } = useQueryGridActions();
  const offer = useFieldOffer(key, "equals");
  const field = getFacetField(def);
  if (!field?.options) {
    return null;
  }
  const equals = {
    values: expandEquals(field, query.equals[key] ?? []),
    multiple,
    onValuesChange: (values: string[]) =>
      dispatch({ type: "setEquals", field: key, values }),
  };
  const counted = runnable.isFacetCountExact(query);
  const showCounts = counted && facets.loaded;
  const countOf = (value: string) =>
    facets.result.find((item) => item.value === value)?.count ?? 0;
  const shown = counted ? "counter" : "hidden";
  const note = runnable.facetCountsFollowFilters ? "following" : shown;
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
