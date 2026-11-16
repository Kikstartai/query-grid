"use client";

import type { ReactNode } from "react";

import {
  formatValue,
  type FieldTone,
  type GridRow,
  type GridValue,
} from "@kikstart/query-grid";

import type { FieldDef } from "./fields.ts";
import { formatCell, useLocale, useMessages } from "./messages.tsx";

const LIST_MAX_ITEMS = 3;

export interface BadgeCellProps {
  label: string;
  tone?: FieldTone;
}

export function BadgeCell({ label, tone = "neutral" }: BadgeCellProps) {
  if (label === "") {
    return null;
  }
  return (
    <span className="qg-badge" data-tone={tone}>
      <bdi>{label}</bdi>
    </span>
  );
}

export interface ListCellProps {
  items: string[];
  max?: number;
}

function ListMore({ count }: { count: number }) {
  const messages = useMessages();
  if (count <= 0) {
    return null;
  }
  return (
    <span className="qg-list-more" data-list-more={count}>
      <bdi>{messages.moreItems({ count })}</bdi>
    </span>
  );
}

export function ListCell({ items, max = LIST_MAX_ITEMS }: ListCellProps) {
  const shown = items.slice(0, max);
  return (
    <span className="qg-list-cell" title={items.join(", ")}>
      {shown.map((item) => (
        <span key={item} className="qg-list-item">
          <bdi>{item}</bdi>
        </span>
      ))}
      <ListMore count={items.length - shown.length} />
    </span>
  );
}

export interface LinkCellProps {
  href: string;
  external?: boolean;
  children: ReactNode;
}

export function LinkCell({ href, external = false, children }: LinkCellProps) {
  return (
    <a
      className="qg-link-cell"
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
    >
      <bdi>{children}</bdi>
    </a>
  );
}

const SAFE_HREF = /^(https?:|mailto:|tel:|\/(?!\/)|#|\?)/i;

// A link built from a row's own value must not become a script: only a web, mail, phone or same-site address is rendered as a link.
export function createLinkCell(
  toHref: (value: GridValue, row: GridRow) => string | null,
  external = false,
): NonNullable<FieldDef["cell"]> {
  return (value, row) => {
    const href = toHref(value, row);
    const text = Array.isArray(value) ? value.join(", ") : String(value ?? "");
    if (href === null || !SAFE_HREF.test(href)) {
      return <bdi>{text}</bdi>;
    }
    return (
      <LinkCell href={href} external={external}>
        {text}
      </LinkCell>
    );
  };
}

export interface FieldCellProps {
  field: FieldDef;
  value: GridValue;
  row: GridRow;
}

export function FieldCell({ field, value, row }: FieldCellProps) {
  const messages = useMessages();
  const locale = useLocale();
  if (field.cell) {
    return field.cell(value, row);
  }
  if (field.render === "badge") {
    return (
      <BadgeCell
        label={formatCell(messages, field, value, locale)}
        tone={field.tones?.[String(value)]}
      />
    );
  }
  if (field.render === "list" && Array.isArray(value)) {
    return (
      <ListCell items={value.map((item) => formatValue(field, item, locale))} />
    );
  }
  return <bdi>{formatCell(messages, field, value, locale)}</bdi>;
}
