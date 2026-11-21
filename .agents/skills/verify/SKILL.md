---
name: verify
description: How to verify a query-grid change in the running demo — how to start it and which pages to drive. Read it whenever /verify or deliver checks a change in the app.
---

# Verify in the demo

## Start the app

1. `apps/demo/.env.local` must hold `QUERY_GRID_DATABASE_URL`; without it the demo has no data, so say so and stop.
2. `bun run build` from the repo root.
3. `next start` from `apps/demo` on a free port, never 3040, where the user's own dev server may be: `bun x next start -p <port>`, run in the background.

## Pages worth driving

- The orders grid: filters, sort, Match any, and refused filters, held with their reason.
- The facet panel.
- Phone width and right-to-left.
- The board, last: its moves write real data to the database.
