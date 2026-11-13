"use client";

import { Button } from "@ui-sdk/react/button";

import { getField, type FieldOption } from "../model/field-types.ts";
import { formatCount } from "../model/format.ts";
import { isFacetCountShown } from "../model/shapes.ts";
import {
  useFacetState,
  useQueryDispatch,
  useQueryGrid,
  useQueryRules,
  useQueryState,
} from "../react/query-grid-provider.tsx";
import { useOfferState } from "./field-filter.tsx";

interface FacetButtonProps {
  field: string;
  option: FieldOption;
  selected: boolean;
  disabled: boolean;
  count: string;
}

function FacetButton({
  field,
  option,
  selected,
  disabled,
  count,
}: FacetButtonProps) {
  const dispatch = useQueryDispatch();
  return (
    <Button
      className="qg-facet"
      data-facet={option.value}
      aria-pressed={selected}
      disabled={disabled}
      onClick={() =>
        dispatch({ type: "setEquals", field, value: option.value })
      }
    >
      <span>{option.label}</span>
      <span className="qg-facet-count" data-facet-count>
        {count}
      </span>
    </Button>
  );
}

function FacetNote({ showCounts }: { showCounts: boolean }) {
  const mode = useQueryRules().mode;
  if (mode === "memory") {
    return <p className="qg-facet-note">Counts follow the other filters.</p>;
  }
  if (showCounts) {
    return (
      <p className="qg-facet-note">
        Counts come from a trigger-maintained counter table.
      </p>
    );
  }
  return (
    <p className="qg-facet-note">
      Counts are hidden while another filter is active: no counter answers
      them.
    </p>
  );
}

export function FacetPanel() {
  const { def } = useQueryGrid();
  const query = useQueryState();
  const rules = useQueryRules();
  const facets = useFacetState();
  const dispatch = useQueryDispatch();
  const key = def.facet?.field ?? "";
  const offer = useOfferState({ kind: "equals", field: key });
  const field = getField(def, key);
  if (!field?.options) {
    return null;
  }
  const selected = query.equals[field.key] ?? null;
  const showCounts = isFacetCountShown(def, query, rules.mode);
  const total = facets.counts.reduce((sum, facet) => sum + facet.count, 0);
  const countOf = (value: string) => {
    const facet = facets.counts.find((item) => item.value === value);
    return showCounts ? formatCount(facet?.count ?? 0, def.format) : "";
  };
  return (
    <div
      className="qg-facets"
      role="group"
      aria-label={field.label}
      title={offer.reason ?? undefined}
      data-part="facet-panel"
    >
      <div className="qg-facets-title">{field.label}</div>
      <Button
        className="qg-facet"
        data-facet=""
        aria-pressed={selected === null}
        disabled={selected === null}
        onClick={() => dispatch({ type: "clearEquals", field: field.key })}
      >
        <span>All</span>
        <span className="qg-facet-count">
          {showCounts ? formatCount(total, def.format) : ""}
        </span>
      </Button>
      {field.options.map((option) => (
        <FacetButton
          key={option.value}
          field={field.key}
          option={option}
          selected={selected === option.value}
          disabled={!offer.offered}
          count={countOf(option.value)}
        />
      ))}
      <FacetNote showCounts={showCounts} />
    </div>
  );
}
