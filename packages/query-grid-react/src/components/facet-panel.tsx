"use client";

import { Button } from "@ui-sdk/react/button";
import type { ReactNode } from "react";

import { formatCount } from "@kikstart/query-grid";

import { useLocale, useMessages } from "./messages.tsx";

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
}

interface FacetCountProps {
  count: number | null | undefined;
}

function FacetCountText({ count }: FacetCountProps) {
  const locale = useLocale();
  return (
    <bdi className="qg-facet-count" data-facet-count>
      {count === null || count === undefined ? "" : formatCount(count, locale)}
    </bdi>
  );
}

function FacetNote({ note }: { note: ReactNode }) {
  if (!note) {
    return null;
  }
  return (
    <p className="qg-facet-note">
      <bdi>{note}</bdi>
    </p>
  );
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
        <bdi>{messages.all}</bdi>
        <FacetCountText count={total} />
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
          <bdi>{option.label}</bdi>
          <FacetCountText count={option.count} />
        </Button>
      ))}
      <FacetNote note={note} />
    </div>
  );
}
