"use client";

import { createVirtualizer } from "@ui-sdk/core";
import { useEffect, useState, type RefObject } from "react";

import {
  formatValue,
  type FieldDef,
  type GridFormat,
  type GridRow,
} from "@kikstart/query-grid";

import { FeedNotice, isWindowBlank } from "./feed-notice.tsx";
import type { RowWindow } from "./fields.ts";
import { formatLoaded, useMessages } from "./messages.tsx";
import { FILL_COLUMN_STYLE } from "./part-props.ts";
import { useLatest } from "./use-latest.ts";
import { useVirtualItems } from "./use-virtual-items.ts";

const CARD_ESTIMATE = 92;

type LatestWindow = RefObject<Pick<RowWindow, "rows" | "onEndReached">>;

function createListVirtualizer(latest: LatestWindow) {
  return createVirtualizer({
    count: () => latest.current.rows.length,
    estimate: () => CARD_ESTIMATE,
    key: (index) => latest.current.rows[index]?.id ?? String(index),
    overscan: 6,
    endThreshold: 40,
    onEnd: () => latest.current.onEndReached(),
  });
}

type ListVirtualizer = ReturnType<typeof createListVirtualizer>;

interface CardProps {
  virtual: ListVirtualizer;
  index: number;
  start: number;
  row: GridRow;
  fields: FieldDef[];
  format?: GridFormat;
}

function Card({ virtual, index, start, row, fields, format }: CardProps) {
  const [measure] = useState(
    () => (el: HTMLElement | null) => virtual.measure(index, el),
  );
  const [title, badge, ...rest] = fields;
  return (
    <article
      ref={measure}
      data-card={row.id}
      data-index={index}
      className="qg-card-slot"
      style={{
        position: "absolute",
        top: 0,
        insetInlineStart: 0,
        width: "100%",
        transform: `translateY(${start}px)`,
      }}
    >
      <div className="qg-card">
        <div className="qg-card-head">
          <span className="qg-card-title">
            {title.label} {formatValue(title, row[title.key] ?? null, format)}
          </span>
          <span className="qg-badge" data-value={row[badge.key] ?? ""}>
            {formatValue(badge, row[badge.key] ?? null, format)}
          </span>
        </div>
        <dl className="qg-card-details">
          {rest.flatMap((field) => {
            const text = formatValue(field, row[field.key] ?? null, format);
            return text
              ? [
                  <div key={field.key} className="qg-card-detail">
                    <dt>{field.label}:</dt>
                    <dd>{text}</dd>
                  </div>,
                ]
              : [];
          })}
        </dl>
      </div>
    </article>
  );
}

export interface CardListProps extends RowWindow {
  fields: FieldDef[];
  titleField: string;
  badgeField: string;
  format?: GridFormat;
}

export function CardList(props: CardListProps) {
  const { rows, onEndReached, titleField, badgeField, format } = props;
  const messages = useMessages();
  const latest = useLatest({ rows, onEndReached });
  const [virtual] = useState(() => createListVirtualizer(latest));
  const { items, size } = useVirtualItems(virtual);

  useEffect(() => {
    virtual.refresh();
  }, [virtual, rows]);

  const lead = [titleField, badgeField];
  const fields = [
    ...props.fields.filter((field) => field.key === titleField),
    ...props.fields.filter((field) => field.key === badgeField),
    ...props.fields.filter(
      (field) => !lead.includes(field.key) && !field.hidden,
    ),
  ];

  if (isWindowBlank(props) || fields.length < 2) {
    return <FeedNotice {...props} />;
  }
  return (
    <div className="qg-list" data-part="list" style={FILL_COLUMN_STYLE}>
      <div className="qg-status" data-status="loaded" data-value={rows.length}>
        {formatLoaded(messages, rows.length, props.pages, format)}
      </div>
      <div
        className="qg-list-scroller"
        data-part="list-scroller"
        data-mounted={items.length}
        style={{ minHeight: 0, flex: "1 1 0%", overflow: "auto" }}
        ref={(el) => (el ? virtual.connect(el) : undefined)}
      >
        <div style={{ position: "relative", height: size }}>
          {items.flatMap((item) => {
            const row = rows[item.index];
            return row
              ? [
                  <Card
                    key={`${item.key}:${item.index}`}
                    virtual={virtual}
                    index={item.index}
                    start={item.start}
                    row={row}
                    fields={fields}
                    format={format}
                  />,
                ]
              : [];
          })}
        </div>
      </div>
    </div>
  );
}
