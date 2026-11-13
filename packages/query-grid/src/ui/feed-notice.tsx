import type { FeedState } from "../react/feed.ts";

export function isFeedBlank(feed: FeedState): boolean {
  return feed.status === "error" || feed.rows.length === 0;
}

export function FeedNotice({ feed }: { feed: FeedState }) {
  if (feed.status === "error") {
    return (
      <p className="qg-notice qg-notice-error" data-feed-state="error">
        {feed.error}
      </p>
    );
  }
  if (feed.status === "loading" || feed.pages === 0) {
    return (
      <p className="qg-notice" data-feed-state="loading">
        Loading…
      </p>
    );
  }
  return (
    <p className="qg-notice" data-feed-state="empty">
      No rows match.
    </p>
  );
}
