"use client";

import type { RowWindow } from "./fields.ts";
import { formatLoaded, useLocale, useMessages } from "./messages.tsx";

type NoticeProps = Pick<RowWindow, "rows" | "loading" | "error" | "pages">;

export function isWindowBlank(props: NoticeProps): boolean {
  return Boolean(props.error) || props.rows.length === 0;
}

function isWindowPending(props: Pick<RowWindow, "loading" | "pages">): boolean {
  return props.loading || props.pages === 0;
}

type LoadedTextProps = Pick<RowWindow, "rows" | "loading" | "pages">;

export function LoadedText({ rows, loading, pages }: LoadedTextProps) {
  const messages = useMessages();
  const locale = useLocale();
  if (rows.length === 0 && isWindowPending({ loading, pages })) {
    return null;
  }
  return (
    <bdi data-status="loaded" data-value={rows.length}>
      {formatLoaded(messages, rows.length, pages, locale)}
    </bdi>
  );
}

export function FeedNotice({ loading, error, pages }: NoticeProps) {
  const messages = useMessages();
  if (error) {
    return (
      <p className="qg-notice qg-notice-error" data-feed-state="error">
        <bdi>{error}</bdi>
      </p>
    );
  }
  if (isWindowPending({ loading, pages })) {
    return (
      <p className="qg-notice" data-feed-state="loading">
        <bdi>{messages.loading}</bdi>
      </p>
    );
  }
  return (
    <p className="qg-notice" data-feed-state="empty">
      <bdi>{messages.noRows}</bdi>
    </p>
  );
}
