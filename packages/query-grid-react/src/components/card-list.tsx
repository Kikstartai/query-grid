"use client";

import { createVirtualizer } from "@ui-sdk/core";
import { useEffect, useState, type RefObject } from "react";

import { formatValue, type GridRow } from "@kikstart/query-grid";

import { FeedNotice, isWindowBlank, LoadedText } from "./feed-notice.tsx";
import type { FieldDef, RowWindow } from "./fields.ts";
import { useLocale } from "./messages.tsx";
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

interface CardValueProps {
  field: FieldDef;
  row: GridRow;
}

function CardValue({ field, row }: CardValueProps) {
  const locale = useLocale();
  const value = row[field.key] ?? null;
  if (field.cell) {
    return field.cell(value, row);
  }
  return <bdi>{formatValue(field, value, locale)}</bdi>;
}

interface CardProps {
  virtual: ListVirtualizer;
  index: number;
  start: number;
  row: GridRow;
  fields: FieldDef[];
}

function Card({ virtual, index, start, row, fields }: CardProps) {
  const locale = useLocale();
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
          <div className="qg-card-title">
            <bdi>{title.label}</bdi> <CardValue field={title} row={row} />
          </div>
          <span className="qg-badge" data-value={row[badge.key] ?? ""}>
            <CardValue field={badge} row={row} />
          </span>
        </div>
        <dl className="qg-card-details">
          {rest.flatMap((field) => {
            const text = formatValue(field, row[field.key] ?? null, locale);
            return text
              ? [
                  <div key={field.key} className="qg-card-detail">
                    <dt>
                      <bdi>{field.label}:</bdi>
                    </dt>
                    <dd>
                      <CardValue field={field} row={row} />
                    </dd>
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
}

export function CardList(props: CardListProps) {
  const { rows, onEndReached, titleField, badgeField } = props;
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
      <div className="qg-status">
        <LoadedText rows={rows} loading={props.loading} pages={props.pages} />
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
                  />,
                ]
              : [];
          })}
        </div>
      </div>
    </div>
  );
}
