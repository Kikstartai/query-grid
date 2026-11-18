"use client";

import { Button } from "@ui-sdk/react/button";

import {
  formatSum,
  type BaseFieldDef,
  type CountResult,
  type TotalAvailable,
} from "@kikstart/query-grid";

import type { LoadStatus } from "./fields.ts";
import {
  formatRows,
  useCurrency,
  useLocale,
  useMessages,
} from "./messages.tsx";

export type CountValue = CountResult;

export interface CountDisplayProps {
  status: LoadStatus;
  value: CountValue | null;
  onRequestExact?: () => void;
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
}: CountDisplayProps) {
  const messages = useMessages();
  const locale = useLocale();
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
        {formatRows(messages, count, locale, capped)}
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
  totals: TotalCell[];
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

interface TotalCellProps {
  cell: TotalCell;
}

function TotalCellValue({ cell }: TotalCellProps) {
  const messages = useMessages();
  const locale = useLocale();
  const currency = useCurrency();
  if (cell.reason) {
    return (
      <bdi className="qg-muted" data-total-reason>
        {cell.reason}
      </bdi>
    );
  }
  if (!cell.value) {
    return <bdi className="qg-muted">{messages.totalling}</bdi>;
  }
  return (
    <bdi className="qg-total-value" data-total-sum={cell.value.sum}>
      {formatSum(cell.field, cell.value.sum, locale, currency)}
    </bdi>
  );
}

function resolveCellState(cell: TotalCell): string {
  if (cell.reason) {
    return "unavailable";
  }
  return cell.value?.source ?? "loading";
}

function TotalCellView({ cell }: TotalCellProps) {
  const messages = useMessages();
  return (
    <div
      className="qg-total-cell"
      data-total-field={cell.field.key}
      data-total={resolveCellState(cell)}
    >
      <bdi className="qg-total-label">
        {messages.totalSum({ label: cell.field.label })}
      </bdi>
      <TotalCellValue cell={cell} />
    </div>
  );
}

export function TotalFooter({ totals }: TotalFooterProps) {
  const messages = useMessages();
  const locale = useLocale();
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
        {messages.totalling}
      </div>
    );
  }
  const rows = formatRows(messages, first.rows, locale);
  return (
    <div className="qg-total" data-part="total" data-total={first.source}>
      {totals.map((cell) => (
        <TotalCellView key={cell.field.key} cell={cell} />
      ))}
      <bdi className="qg-muted">
        {first.source === "counter"
          ? messages.totalFromCounter({ rows })
          : messages.totalLive({ rows })}
      </bdi>
    </div>
  );
}
