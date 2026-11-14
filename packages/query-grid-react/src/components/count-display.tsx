"use client";

import { Button } from "@ui-sdk/react/button";

import {
  formatCount,
  formatMoney,
  type GridFormat,
} from "@kikstart/query-grid";

import type { LoadStatus } from "./fields.ts";
import { formatRows, resolveLocale, useMessages } from "./messages.tsx";

export interface CountValue {
  count: number;
  capped: boolean;
  source: "counter" | "capped" | "exact";
}

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
      <span
        className="qg-count-value"
        data-count={count}
        data-count-source={source}
      >
        {capped
          ? messages.rowsCapped({
              count,
              formatted: formatCount(count, format),
              locale: resolveLocale(format),
            })
          : formatRows(messages, count, format)}
      </span>
      <span className="qg-muted">
        {messages.countSources[underCap ? "underCap" : source]}
      </span>
      <ExactCountButton
        capped={capped}
        loading={status === "loading"}
        onRequestExact={onRequestExact}
      />
    </div>
  );
}

export interface TotalValue {
  sum: number;
  rows: number;
  source: "counter" | "live";
}

export interface TotalFooterProps {
  status: LoadStatus;
  value: TotalValue | null;
  label?: string;
  reason?: string | null;
  format?: GridFormat;
}

function TotalUnavailable({ reason }: { reason: string }) {
  const messages = useMessages();
  return (
    <div className="qg-total" data-part="total" data-total="unavailable">
      <span className="qg-total-label">{messages.noTotal}</span>
      <span className="qg-muted" data-total-reason>
        {reason}
      </span>
    </div>
  );
}

export function TotalFooter({
  status,
  value,
  label,
  reason,
  format,
}: TotalFooterProps) {
  const messages = useMessages();
  if (reason) {
    return <TotalUnavailable reason={reason} />;
  }
  if (!value) {
    return (
      <div className="qg-total qg-muted" data-part="total" data-total="loading">
        {status === "error" ? messages.noTotal : messages.totalling}
      </div>
    );
  }
  const rows = formatRows(messages, value.rows, format);
  return (
    <div className="qg-total" data-part="total" data-total={value.source}>
      <span className="qg-total-label">
        {messages.totalSum({ label: label ?? messages.total })}
      </span>
      <span className="qg-total-value" data-total-sum={value.sum}>
        {formatMoney(value.sum, format)}
      </span>
      <span className="qg-muted">
        {value.source === "counter"
          ? messages.totalFromCounter({ rows })
          : messages.totalLive({ rows })}
      </span>
    </div>
  );
}
