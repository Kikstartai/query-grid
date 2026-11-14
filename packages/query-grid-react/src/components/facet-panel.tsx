"use client";

import { Button } from "@ui-sdk/react/button";
import type { ReactNode } from "react";

import { formatCount, type GridFormat } from "@kikstart/query-grid";

import { useMessages } from "./messages.tsx";

export interface FacetOption {
  value: string;
  label: string;
  count?: number | null;
}

export interface FacetPanelProps {
  label: string;
  options: FacetOption[];
  values: string[];
  onValuesChange: (values: string[]) => void;
  multiple?: boolean;
  total?: number | null;
  note?: ReactNode;
  disabled?: boolean;
  reason?: string | null;
  format?: GridFormat;
}

interface FacetCountProps {
  count: number | null | undefined;
  format?: GridFormat;
}

function FacetCountText({ count, format }: FacetCountProps) {
  return (
    <span className="qg-facet-count" data-facet-count>
      {count === null || count === undefined ? "" : formatCount(count, format)}
    </span>
  );
}

function FacetNote({ note }: { note: ReactNode }) {
  if (!note) {
    return null;
  }
  return <p className="qg-facet-note">{note}</p>;
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export function FacetPanel({
  label,
  options,
  values,
  onValuesChange,
  multiple,
  total,
  note,
  disabled,
  reason,
  format,
}: FacetPanelProps) {
  const messages = useMessages();
  const none = values.length === 0;
  return (
    <div
      className="qg-facets"
      role="group"
      aria-label={label}
      title={reason ?? undefined}
      data-part="facet-panel"
    >
      <div className="qg-facets-title">{label}</div>
      <Button
        className="qg-facet"
        data-facet=""
        aria-pressed={none}
        disabled={none}
        onClick={() => onValuesChange([])}
      >
        <span>{messages.all}</span>
        <FacetCountText count={total} format={format} />
      </Button>
      {options.map((option) => (
        <Button
          key={option.value}
          className="qg-facet"
          data-facet={option.value}
          aria-pressed={values.includes(option.value)}
          disabled={disabled}
          onClick={() =>
            onValuesChange(
              multiple ? toggleValue(values, option.value) : [option.value],
            )
          }
        >
          <span>{option.label}</span>
          <FacetCountText count={option.count} format={format} />
        </Button>
      ))}
      <FacetNote note={note} />
    </div>
  );
}
