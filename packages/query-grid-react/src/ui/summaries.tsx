"use client";

import { getFacetField, getField } from "@kikstart/query-grid";

import {
  CountDisplay as BaseCountDisplay,
  TotalFooter as BaseTotalFooter,
} from "../components/count-display.tsx";
import { FacetPanel as BaseFacetPanel } from "../components/facet-panel.tsx";
import { formatProblemMessage, useMessages } from "../components/messages.tsx";
import {
  ViewSwitch as BaseViewSwitch,
  type ViewOption as BaseViewOption,
} from "../components/view-switch.tsx";
import type { GridView } from "@kikstart/query-grid";
import {
  useCountState,
  useFacetState,
  useGridView,
  useOffers,
  useOfferState,
  useQueryDispatch,
  useQueryGrid,
  useQueryRules,
  useQueryState,
  useTotalState,
} from "../react/query-grid-provider.tsx";

export function CountDisplay() {
  const { def, counts } = useQueryGrid();
  const state = useCountState();
  return (
    <BaseCountDisplay
      status={state.status}
      value={state.result}
      onRequestExact={counts.requestExact}
      format={def.format}
    />
  );
}

export function TotalFooter() {
  const { def } = useQueryGrid();
  const messages = useMessages();
  const state = useTotalState();
  const problem =
    state.error ??
    (state.result && !state.result.available ? state.result : null);
  return (
    <BaseTotalFooter
      status={state.status}
      value={state.result?.available ? state.result : null}
      label={getField(def, def.total?.field ?? "")?.label}
      reason={
        problem ? formatProblemMessage(messages, problem, def.format) : null
      }
      format={def.format}
    />
  );
}

export function FacetPanel() {
  const { def } = useQueryGrid();
  const messages = useMessages();
  const query = useQueryState();
  const { capabilities } = useQueryRules();
  const facets = useFacetState();
  const offers = useOffers();
  const dispatch = useQueryDispatch();
  const key = def.facet?.field ?? "";
  const offer = useOfferState({ kind: "equals", field: key });
  const field = getFacetField(def);
  if (!field?.options) {
    return null;
  }
  const showCounts = capabilities.isFacetCountShown(query);
  const countOf = (value: string) =>
    facets.result.find((item) => item.value === value)?.count ?? 0;
  const shown = showCounts ? "counter" : "hidden";
  return (
    <BaseFacetPanel
      label={field.label}
      options={field.options.map((option) => ({
        ...option,
        count: showCounts ? countOf(option.value) : null,
      }))}
      values={query.equals[field.key] ?? []}
      onValuesChange={(values) =>
        dispatch({ type: "setEquals", field: field.key, values })
      }
      multiple={offers.multi.includes(field.key)}
      total={
        showCounts
          ? facets.result.reduce((sum, facet) => sum + facet.count, 0)
          : null
      }
      note={
        messages.facetNotes[capabilities.mode === "memory" ? "memory" : shown]
      }
      disabled={!offer.offered}
      reason={offer.reason}
      format={def.format}
    />
  );
}

export type ViewOption = BaseViewOption<GridView>;

export interface ViewSwitchProps {
  views: ViewOption[];
}

export function ViewSwitch({ views }: ViewSwitchProps) {
  const { store } = useQueryGrid();
  return (
    <BaseViewSwitch
      views={views}
      value={useGridView()}
      onValueChange={store.setView}
    />
  );
}
