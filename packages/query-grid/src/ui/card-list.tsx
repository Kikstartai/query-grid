"use client";

import { createVirtualizer } from "@ui-sdk/core";
import { useEffect, useState } from "react";

import type { FieldDef, GridFormat, GridRow } from "../model/field-types.ts";
import { formatLoaded, formatValue } from "../model/format.ts";
import type { Feed } from "../react/feed.ts";
import { useFeedState, useQueryGrid } from "../react/query-grid-provider.tsx";
import { FeedNotice, isFeedBlank } from "./feed-notice.tsx";
import { FILL_COLUMN_STYLE } from "./part-props.ts";
import { useVirtualItems } from "./use-virtual-items.ts";

const CARD_ESTIMATE = 92;

function createListVirtualizer(feed: Feed) {
  return createVirtualizer({
    count: () => feed.getState().rows.length,
    estimate: () => CARD_ESTIMATE,
    key: (index) => feed.getState().rows[index]?.id ?? String(index),
    overscan: 6,
    endThreshold: 40,
    onEnd: feed.loadMore,
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
        left: 0,
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

interface CardListProps {
  titleField: string;
  badgeField: string;
}

export function CardList({ titleField, badgeField }: CardListProps) {
  const { def, feed } = useQueryGrid();
  const feedState = useFeedState();
  const [virtual] = useState(() => createListVirtualizer(feed));
  const { items, size } = useVirtualItems(virtual);
  const loaded = feedState.rows.length;
  const rows = feedState.rows;

  useEffect(() => {
    virtual.refresh();
  }, [virtual, rows]);

  const lead = [titleField, badgeField];
  const fields = [
    ...def.fields.filter((field) => field.key === titleField),
    ...def.fields.filter((field) => field.key === badgeField),
    ...def.fields.filter((field) => !lead.includes(field.key) && !field.hidden),
  ];

  if (isFeedBlank(feedState)) {
    return <FeedNotice feed={feedState} />;
  }
  return (
    <div className="qg-list" data-part="list" style={FILL_COLUMN_STYLE}>
      <div className="qg-status" data-status="loaded" data-value={loaded}>
        {formatLoaded(loaded, feedState.pages, def.format)}
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
            const row = feedState.rows[item.index];
            return row
              ? [
                  <Card
                    key={`${item.key}:${item.index}`}
                    virtual={virtual}
                    index={item.index}
                    start={item.start}
                    row={row}
                    fields={fields}
                    format={def.format}
                  />,
                ]
              : [];
          })}
        </div>
      </div>
    </div>
  );
}
