"use client";

import type { RowWindow } from "./fields.ts";
import { useMessages } from "./messages.tsx";

type NoticeProps = Pick<RowWindow, "rows" | "loading" | "error" | "pages">;

export function isWindowBlank(props: NoticeProps): boolean {
  return Boolean(props.error) || props.rows.length === 0;
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
  if (loading || pages === 0) {
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
