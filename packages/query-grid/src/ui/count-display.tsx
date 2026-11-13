"use client";

import { Button } from "@ui-sdk/react/button";

import { formatCount, formatMoney } from "../model/format.ts";
import { getField } from "../model/field-types.ts";
import {
  useCountState,
  useQueryGrid,
  useTotalState,
} from "../react/query-grid-provider.tsx";

const SOURCE_LABELS = {
  counter: "exact, from the counter table",
  capped: "capped count",
  exact: "exact count",
} as const;

interface ExactCountButtonProps {
  capped: boolean;
  loading: boolean;
}

function ExactCountButton({ capped, loading }: ExactCountButtonProps) {
  const { counts } = useQueryGrid();
  if (!capped) {
    return null;
  }
  return (
    <Button
      className="qg-button"
      data-count-exact
      disabled={loading}
      onClick={counts.requestExact}
    >
      {loading ? "Counting…" : "Exact count"}
    </Button>
  );
}

export function CountDisplay() {
  const { def } = useQueryGrid();
  const state = useCountState();
  if (state.status === "error") {
    return (
      <div className="qg-count qg-count-error" data-part="count">
        Count unavailable
      </div>
    );
  }
  if (!state.result) {
    return (
      <div className="qg-count qg-muted" data-part="count">
        Counting…
      </div>
    );
  }
  const { count, capped, source } = state.result;
  return (
    <div className="qg-count" data-part="count">
      <span
        className="qg-count-value"
        data-count={count}
        data-count-source={source}
      >
        {formatCount(count, def.format)}
        {capped ? "+" : ""} rows
      </span>
      <span className="qg-muted">{SOURCE_LABELS[source]}</span>
      <ExactCountButton capped={capped} loading={state.status === "loading"} />
    </div>
  );
}

export function TotalFooter() {
  const { def } = useQueryGrid();
  const state = useTotalState();
  const label = getField(def, def.total?.field ?? "")?.label ?? "Total";
  if (state.status === "error") {
    return (
      <div className="qg-total" data-part="total" data-total="unavailable">
        <span className="qg-total-label">No total for this filter.</span>
        <span className="qg-muted" data-total-reason>
          {state.error}
        </span>
      </div>
    );
  }
  if (!state.result) {
    return (
      <div className="qg-total qg-muted" data-part="total" data-total="loading">
        Totalling…
      </div>
    );
  }
  if (!state.result.available) {
    return (
      <div className="qg-total" data-part="total" data-total="unavailable">
        <span className="qg-total-label">No total for this filter.</span>
        <span className="qg-muted" data-total-reason>
          {state.result.reason}
        </span>
      </div>
    );
  }
  const { sum, rows, source } = state.result;
  return (
    <div className="qg-total" data-part="total" data-total={source}>
      <span className="qg-total-label">{label} sum</span>
      <span className="qg-total-value" data-total-sum={sum}>
        {formatMoney(sum, def.format)}
      </span>
      <span className="qg-muted">
        {source === "counter"
          ? `from the counter table, ${formatCount(rows, def.format)} rows`
          : `summed live over ${formatCount(rows, def.format)} rows`}
      </span>
    </div>
  );
}
