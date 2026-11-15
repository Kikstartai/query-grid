"use client";

import { Button } from "@ui-sdk/react/button";

import {
  formatSum,
  type BaseFieldDef,
  type CountResult,
  type GridFormat,
  type TotalAvailable,
} from "@kikstart/query-grid";

import type { LoadStatus } from "./fields.ts";
import { countParams, formatRows, useMessages } from "./messages.tsx";

export type CountValue = CountResult;

export interface CountDisplayProps {
  status: LoadStatus;
  value: CountValue | null;
  onRequestExact?: () => void;
  format?: GridFormat;
}

interface ExactCountButtonProps {
  capped: boolean;
  loading: boolean;
  onRequestExact?: () => void;
}

function ExactCountButton({
  capped,
  loading,
  onRequestExact,
}: ExactCountButtonProps) {
  const messages = useMessages();
  if (!capped || !onRequestExact) {
    return null;
  }
  return (
    <Button data-count-exact disabled={loading} onClick={onRequestExact}>
      {loading ? messages.counting : messages.exactCount}
    </Button>
  );
}

export function CountDisplay({
  status,
  value,
  onRequestExact,
  format,
}: CountDisplayProps) {
  const messages = useMessages();
  if (status === "error") {
    return (
      <div className="qg-count qg-count-error" data-part="count">
        {messages.countUnavailable}
      </div>
    );
  }
  if (!value) {
    return (
      <div className="qg-count qg-muted" data-part="count">
        {messages.counting}
      </div>
    );
  }
  const { count, capped, source } = value;
  const underCap = source === "capped" && !capped;
  return (
    <div className="qg-count" data-part="count">
      <bdi
        className="qg-count-value"
        data-count={count}
        data-count-source={source}
      >
        {capped
          ? messages.rowsCapped(countParams(count, format))
          : formatRows(messages, count, format)}
      </bdi>
      <bdi className="qg-muted">
        {messages.countSources[underCap ? "underCap" : source]}
      </bdi>
      <ExactCountButton
        capped={capped}
        loading={status === "loading"}
        onRequestExact={onRequestExact}
      />
    </div>
  );
}

export type TotalValue = Pick<TotalAvailable, "sum" | "rows" | "source">;

export interface TotalCell {
  field: BaseFieldDef;
  value: TotalValue | null;
  reason?: string | null;
}

export interface TotalFooterProps {
  status: LoadStatus;
  totals: TotalCell[];
  format?: GridFormat;
}

function TotalUnavailable({ reason }: { reason: string }) {
  const messages = useMessages();
  return (
    <div className="qg-total" data-part="total" data-total="unavailable">
      <bdi className="qg-total-label">{messages.noTotal}</bdi>
      <bdi className="qg-muted" data-total-reason>
        {reason}
      </bdi>
    </div>
  );
}

interface TotalCellViewProps {
  cell: TotalCell;
  format?: GridFormat;
}

function TotalCellView({ cell, format }: TotalCellViewProps) {
  const messages = useMessages();
  const { field, value, reason } = cell;
  const label = messages.totalSum({ label: field.label });
  if (reason) {
    return (
      <div
        className="qg-total-cell"
        data-total-field={field.key}
        data-total="unavailable"
      >
        <bdi className="qg-total-label">{label}</bdi>
        <bdi className="qg-muted" data-total-reason>
          {reason}
        </bdi>
      </div>
    );
  }
  if (!value) {
    return (
      <div
        className="qg-total-cell"
        data-total-field={field.key}
        data-total="loading"
      >
        <bdi className="qg-total-label">{label}</bdi>
        <bdi className="qg-muted">{messages.totalling}</bdi>
      </div>
    );
  }
  return (
    <div
      className="qg-total-cell"
      data-total-field={field.key}
      data-total={value.source}
    >
      <bdi className="qg-total-label">{label}</bdi>
      <bdi className="qg-total-value" data-total-sum={value.sum}>
        {formatSum(field, value.sum, format)}
      </bdi>
    </div>
  );
}

export function TotalFooter({ status, totals, format }: TotalFooterProps) {
  const messages = useMessages();
  if (totals.length === 0) {
    return null;
  }
  const reasons = totals.flatMap((cell) => cell.reason || []);
  if (reasons.length === totals.length) {
    return <TotalUnavailable reason={reasons[0]} />;
  }
  const first = totals.find((cell) => cell.value)?.value;
  if (!first) {
    return (
      <div className="qg-total qg-muted" data-part="total" data-total="loading">
        {status === "error" ? messages.noTotal : messages.totalling}
      </div>
    );
  }
  const rows = formatRows(messages, first.rows, format);
  return (
    <div className="qg-total" data-part="total" data-total={first.source}>
      {totals.map((cell) => (
        <TotalCellView key={cell.field.key} cell={cell} format={format} />
      ))}
      <bdi className="qg-muted">
        {first.source === "counter"
          ? messages.totalFromCounter({ rows })
          : messages.totalLive({ rows })}
      </bdi>
    </div>
  );
}
