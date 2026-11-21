---
name: verify
description: How to verify a query-grid change in the running demo — start it, which browser to use, which pages to drive, and the Browser health line every report ends with. Read it whenever /verify or deliver checks a change in the app.
---

# Verify in the demo

## Start the app

1. `apps/demo/.env.local` must hold `QUERY_GRID_DATABASE_URL`; without it the demo has no data, so say so and stop.
2. `bun run build` from the repo root.
3. `next start` from `apps/demo` on a free port, never 3040, where the user's own dev server may be: `bun x next start -p <port>`, run in the background.

## Browser

Use the in-app browser (`mcp__Claude_Browser__*`) by default. Use agent-browser only where it is absent, outside the desktop app. Say which one was used.

## Pages worth driving

- The orders grid: filters, sort, Match any, and refused filters, held with their reason.
- The facet panel.
- Phone width and right-to-left.
- The board, last: its moves write real data to the database.

## Report

End every report with one **Browser health** line: the browser used and anything it did wrong, or "no issues".
