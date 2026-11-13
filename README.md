# @kikstart/query-grid

A composable filter and data grid for very large Postgres tables, built on [UI SDK](https://ui-sdk.dev). You declare the query shapes your indexes serve. The controls offer exactly those, and the server refuses everything else.

Live demo: {{DEMO_URL}}

## Principles

1. **The UI reflects what the data layer can do.** A filter, sort or combination is offered only when an index answers it fast, and the server refuses any other.
2. **Composition, not a monolith.** Filtering and the grid are separate parts around one query state.
3. **Very large data sets are never a constraint.**

## Install

```bash
npm install @kikstart/query-grid @ui-sdk/core@beta @ui-sdk/react@beta
```

React 19 and UI SDK `0.1.0-beta.1` or later are peer dependencies. The package ships ESM and type declarations, compiled with the React Compiler.

| Entry point                          | Holds                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| `@kikstart/query-grid`               | field and shape types, query state, URL codec, validation, data sources, React hooks |
| `@kikstart/query-grid/server`        | SQL builder, keyset cursor, index and counter DDL, query runner                      |
| `@kikstart/query-grid/ui`            | the parts: filter bar, sidebar, chips, facets, count, total, grid, list, board       |
| `@kikstart/query-grid/ui/styles.css` | the optional default theme                                                           |

## Quick start

Describe the table once. The library has no domain names of its own; a host passes its `GridDef` in.

```ts
import type { GridDef } from "@kikstart/query-grid";

export const ORDERS_GRID: GridDef = {
  table: "orders",
  defaultSort: { field: "created_at", direction: "desc" },
  facet: { field: "status_code", counterTable: "order_status_counts" },
  total: { field: "total" },
  fields: [
    { key: "id", label: "ID", type: "id", operators: [], hidden: true },
    { key: "order_number", label: "Order", type: "integer", operators: [], pinned: true },
    { key: "created_at", label: "Created", type: "datetime", operators: ["range"] },
    { key: "status_code", label: "Status", type: "enum", operators: ["eq"], options: STATUSES },
    { key: "customer_name", label: "Customer", type: "text", operators: [] },
    { key: "total", label: "Total", type: "money", operators: ["range"] },
  ],
  shapes: [
    { equals: [], sort: "created_at", range: true },
    { equals: ["status_code"], sort: "created_at", range: true },
    { equals: ["status_code"], sort: "total", range: true },
    { quick: ["customer_name", "order_number"] },
  ],
};
```

Generate the DDL from it: one index per shape, then the counter table and its triggers.

```ts
import { generateGridMigration } from "@kikstart/query-grid/server";

writeFileSync("migrations/0002_query_grid.sql", generateGridMigration(ORDERS_GRID));
```

Serve it. The executor is yours; the runner validates the shape before any SQL exists.

```ts
import { decodeQuery } from "@kikstart/query-grid";
import { listGridPage, QueryRejected, type SqlExecutor } from "@kikstart/query-grid/server";

const execute: SqlExecutor = async (sql) => (await pool.query(sql.text, sql.values)).rows;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    return Response.json(
      await listGridPage(ORDERS_GRID, execute, decodeQuery(ORDERS_GRID, params), 200),
    );
  } catch (error) {
    if (error instanceof QueryRejected) {
      return Response.json({ error: error.code, message: error.message }, { status: 400 });
    }
    throw error;
  }
}
```

The HTTP data source expects these routes under one base path. `getGridCount`, `getGridTotal` and `listFacetCounts` answer the first three; the rest are the host's own.

| Route               | Answers                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `GET /`             | a keyset page: `{ rows, nextCursor, hasNext }`                       |
| `GET /count`        | `{ count, capped, source }`; `exact=1` asks for the exact count      |
| `GET /total`        | `{ available, sum, rows, source }` or `{ available: false, reason }` |
| `GET /facets`       | `[{ value, count, sum }]` from the counter table                     |
| `GET /options`      | `[{ value, label }]` for a lookup field (`field`, `query`, `value`)  |
| `GET /transitions`  | `[[from, to]]`, for the board                                        |
| `POST /status`      | `{ id, to }` moves one row and returns it, for the board             |

Mount the parts. Each one reads and writes the same query state; mount as many or as few as you need.

```tsx
"use client";

import { QueryGridProvider } from "@kikstart/query-grid";
import { CountDisplay, DataGrid, FacetPanel, FilterBar, FilterChips, FilterSidebar, TotalFooter } from "@kikstart/query-grid/ui";
import "@kikstart/query-grid/ui/styles.css";

export function Orders({ search }: { search: string }) {
  return (
    <QueryGridProvider def={ORDERS_GRID} search={search} basePath="/api/orders">
      <CountDisplay />
      <FilterBar />
      <FilterSidebar />
      <FilterChips />
      <FacetPanel />
      <DataGrid />
      <TotalFooter />
    </QueryGridProvider>
  );
}
```

`search` is the page's query string at first render. The provider mirrors every change back to the URL with `history.replaceState`.

## The two patterns

- **The SQL executor is a Strategy.** `SqlExecutor` is one function, `(sql, settings?) => Promise<rows>`. The runner decides what to run and under which statement budget; the host decides how: `pg`, a serverless driver, a tenant router, a read replica. Swap it without touching the grid. The client's `DataSource` is the same pattern one layer up: `createHttpSource` and `createMemorySource` are two strategies behind the same parts.
- **The `GridDef` is a model the engine reads.** Fields, shapes, the facet and the total are plain data. The offers, the SQL, the DDL, the chips and the controls are all derived from it, so the design is metadata-driven and a host can build a `GridDef` from its own database or configuration at runtime. The library accepts the def as input and never imports one.

## Styling

`./ui` ships no styles of its own beyond the layout the grid cannot work without (sticky and absolute positioning, widths, flex), which is inline. Everything else is yours.

- Every UI SDK part carries its `data-slot` (`select-trigger`, `drawer-content`, `calendar-day`) and state attributes (`data-open`, `data-highlighted`, `data-disabled`, `data-checked`).
- Every element the package renders carries a stable `qg-` class (`qg-select-trigger`, `qg-row`, `qg-cell`, `qg-chip`, `qg-facet`) and the grid's own state attributes (`data-active`, `data-selected`, `data-pinned`, `data-unavailable`).
- `@kikstart/query-grid/ui/styles.css` is an optional default theme in plain CSS. Every selector sits inside `:where()`, so it has no specificity and any rule of yours wins. It reads `--qg-*` custom properties:

```css
:root {
  --qg-primary: #4f46e5;
  --qg-radius: 2px;
  --qg-control-height: 28px;
}
```

A Tailwind restyle of one Select and one grid row, from the demo's [`/restyled`]({{DEMO_URL}}/restyled) route. No Tailwind is in the package; the consumer's stylesheet targets the classes and state attributes:

```css
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);

.restyled .qg-select-trigger {
  @apply h-9 rounded-none border-2 border-slate-900 bg-amber-50 px-3 font-mono text-xs tracking-wide uppercase;
}

.restyled .qg-select-trigger[data-open] {
  @apply bg-slate-900 text-amber-50;
}

.restyled .qg-row {
  @apply border-b border-dashed border-slate-400 bg-amber-50 font-mono text-xs hover:bg-amber-200;
}

.restyled .qg-row:has([data-active]) {
  @apply bg-amber-200;
}
```

Skip `styles.css` entirely to start from unstyled parts. Sticky cells then need an opaque background of your own.

The demo site wears kikstart's brand: [`apps/demo/src/app/globals.css`](apps/demo/src/app/globals.css) maps kikstart's colours, radius and Geist fonts onto the `--qg-*` properties. The package's own `styles.css` stays brand-neutral.

## Using the hooks alone

The hooks in the root entry are complete without `./ui`. Build your own controls on them:

```tsx
"use client";

import { QueryGridProvider, useFeedState, useOffers, useQueryDispatch, useQueryGrid, useQueryState } from "@kikstart/query-grid";

function StatusButtons() {
  const { def } = useQueryGrid();
  const query = useQueryState();
  const offers = useOffers();
  const dispatch = useQueryDispatch();
  const status = def.fields.find((field) => field.key === "status_code");
  return (
    <div>
      {status?.options?.map((option) => (
        <button
          key={option.value}
          disabled={!offers.equals.includes("status_code")}
          aria-pressed={query.equals.status_code === option.value}
          onClick={() => dispatch({ type: "setEquals", field: "status_code", value: option.value })}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Rows() {
  const { feed } = useQueryGrid();
  const { rows, hasNext } = useFeedState();
  return (
    <ul>
      {rows.map((row) => (
        <li key={row.id}>{row.order_number}</li>
      ))}
      <li>
        <button disabled={!hasNext} onClick={feed.loadMore}>More</button>
      </li>
    </ul>
  );
}
```

| Hook                                              | Gives                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| `useQueryState`, `useQueryDispatch`               | the query and the one way to change it                                  |
| `useOffers`, `useQueryRules`                      | which filters, ranges, sorts and quick filter an index answers now      |
| `useFeedState`                                    | the loaded rows, paging status and whether the result was capped        |
| `useCountState`, `useTotalState`, `useFacetState` | count, total and facet counts, each fetched only once something reads it |
| `useFilterChips`                                  | one entry per active filter and the sort, each with its clearing action |
| `useColumns`                                      | column order, widths, visibility and pinning, and the laid-out columns  |
| `useGridView`, `useQueryGrid`                     | the current view and the stores themselves                              |

`explainUnavailable(def, query, target, rules)` returns the sentence a disabled control shows. For a host's own export, `useQueryState()` is the query, `useColumns().layout` the visible columns in order, and `walkGridPages(def, execute, query)` on the server yields every page of the result by keyset.

## The in-memory data source

`createMemorySource(def, rows)` runs the same parts and hooks over rows already loaded in full. It filters, sorts, counts and totals in JavaScript. Shapes do not apply, so every declared filter and sort is offered in any combination, and the facet counts follow the other filters.

```tsx
const source = createMemorySource(TASKS_GRID, rows, { transitions });

<QueryGridProvider def={TASKS_GRID} search={search} source={source}>
```

It is meant for small lists: up to a few thousand rows. Every change filters and sorts the whole array, which is instant at 400 rows (the demo's [`/memory`]({{DEMO_URL}}/memory) route) and still under a frame at 5,000. Past that, give the table shapes and an index.

## Design as built

### Field defs and query shapes

A `GridDef` is the single source. Each field carries `key`, `label`, `type`, the filter `operators` it supports (`eq`, `range`), an optional `cell` renderer, a `lookup` for large option lists, and layout hints (`width`, `pinned`, `hidden`, `wrap`).

The grid then declares its **query shapes**. A shape is the unit the data layer answers, because a filter plus a sort is fast only when one index serves both:

- an ordered shape is a set of equality filters, one sort, and optionally a range on that sort column
- the quick-filter shape is a list of columns matched by substring

The demo's orders grid declares ten:

| Shape                                           | Index                                                     |
| ----------------------------------------------- | --------------------------------------------------------- |
| no filter, sort `created_at`, range             | `(created_at, id)`                                        |
| no filter, sort `total`, range                  | `(total, id)`                                             |
| `status_code =`, sort `created_at`, range       | `(status_code, created_at, id)`                           |
| `status_code =`, sort `total`, range            | `(status_code, total, id)`                                |
| `customer_id =`, sort `created_at`              | `(customer_id, created_at, id)`                           |
| `region =`, sort `created_at`, range            | `(region, created_at, id)`                                |
| `channel =`, sort `created_at`                  | `(channel, created_at, id)`                               |
| `status_code =`, `region =`, sort `created_at`  | `(status_code, region, created_at, id)`                   |
| `status_code =`, `channel =`, sort `created_at` | `(status_code, channel, created_at, id)`                  |
| quick filter over `customer_name`, `order_number` | GIN `((customer_name \|\| ' ' \|\| order_number::text) gin_trgm_ops)` |

`validateGridDef` rejects a shape that sorts on a nullable field, repeats another shape, names an operator its field does not offer or puts a timestamp in the quick filter, and requires the default sort with no filter to be a shape.

### One shape, one index

- `generateGridMigration` derives the DDL: equality columns, then the sort column, then `id`; one trigram GIN index over the quick-filter columns joined with spaces; then the counter table, its functions and its three triggers. The file is safe to re-run.
- `listMissingIndexes` compares the def with `pg_indexes` by method and column order, not by name; a partial index does not count. `listCounterObjects` names the counter table's columns and triggers for the same check.
- `matchShape` decides whether a query is declared. The equality set must match exactly, a range must sit on the sort column of a shape that allows it, and the quick filter combines with no other filter.

### The UI offers only declared shapes

Every control renders from `listOffers(def, query, rules)` and writes through `applyAction`, which refuses an action whose result matches no shape. Choosing sort `total` disables region, channel and customer; choosing a status leaves only the sorts a status shape supports. A disabled control carries the reason from `explainUnavailable`: in its `title` in the filter bar, as text in the sidebar. `enumerateReachableStates` walks the same two functions from the default query, and a test asserts that every reachable state is a declared shape and every declared shape is reachable.

### The server refuses the rest

`buildPageSql`, `buildCappedCountSql`, `buildExactCountSql` and `buildCappedTotalSql` call `assertDeclared` before any SQL exists. An undeclared shape, an unknown field, a value outside its type or an undecodable cursor throws `QueryRejected`, which a route handler returns as a 400. Values are bound parameters; identifiers come only from the def and must be plain. A page is capped at 1,000 rows per request whatever the client asks for.

### Keyset paging

A page is `SELECT … FROM orders t WHERE <filters> AND (t.<sort>, t.id) < ($a, $b) ORDER BY t.<sort> DESC, t.id DESC LIMIT n + 1`. The extra row says whether a next page exists and never reaches the client. There is no offset anywhere, so a deep page costs the same as the first. Timestamps cross the wire as microsecond ISO strings so a cursor round-trips exactly. `walkGridPages` is the same loop as an async generator, for a host's export.

### Quick filter

The quick filter is `(<columns joined with spaces>) ILIKE '%term%'` through the trigram GIN index, with `enable_seqscan = off`. It is the one shape whose cost follows the match count rather than the page size, so:

- the server gives it a 120 ms statement budget and refuses a term that exceeds it with a 400 `too_broad`
- it returns at most 500 rows, unordered, with no cursor
- every other filter is disabled while it is active
- when all matches arrive under the cap, the client sorts them in memory and the sort controls come back; over the cap they stay disabled, with the reason

### Query state

`createQueryStore` is one external store holding the equality filters, the range, the quick filter, the sort, the keyset cursor and the view. `QueryGridProvider` creates it from the URL and builds the stores beside it that subscribe to it: the row feed, the count, the total, the facet counts, the lookup labels and the column state. Each starts fetching only when a part subscribes. No component holds a copy of the query.

### Counts

- An unfiltered or status-only query reads the counter table: exact, one row per status.
- Any other query counts inside `LIMIT 10001` and shows `10 000+` above the cap.
- The exact count runs only from the Exact count button, under a 60 s statement timeout.
- The facet panel shows counts only while no filter other than status is active, because no counter answers the rest.

### Totals

The footer totals the def's `total` field, and only in the two cases an index or a counter answers:

- **From the counter table.** The filter is a declared grouping (nothing, or one status): the counter table's `total_sum` is a one-row read.
- **Live, under the cap.** The filtered result has at most 10,000 rows: one query sums `total` over the shape's index scan, which stops at row 10,001.

Any other filter shows `No total for this filter` with the reason. The counter table is maintained by three row triggers, on insert, delete and update of the status or the total.

### Parts

| Part                                        | Reads                                           | Writes                                      |
| ------------------------------------------- | ----------------------------------------------- | ------------------------------------------- |
| `FilterBar` (`QuickFilter`, `FieldFilter`, `SortControl`) | query, offers                     | filters, sort                               |
| `FilterSidebar`                             | query, offers, with each reason shown           | filters, sort                               |
| `FilterChips`                               | query                                           | clears one filter, the sort, or everything  |
| header sort and filter controls             | query, offers                                   | sort, filters                               |
| `FacetPanel`                                | query, offers, facet counts                     | status filter                               |
| `CountDisplay`                              | count store                                     | exact-count request                         |
| `TotalFooter`                               | total store                                     | –                                           |
| `DataGrid`, `ColumnsMenu`                   | feed, query, column state                       | sort, filters, column state                 |
| `CardList`                                  | feed                                            | –                                           |
| `StatusBoard`                               | query, facet counts, one keyset feed per status | the status of one row, through the server   |
| `ViewSwitch`                                | view                                            | view                                        |

### Controls

Every control is a UI SDK component: Select (status, region, channel, sort), Combobox with async options (the customer picker), Date Picker in range mode (created), Number Input (total range), Input (quick filter), Popover (header filters, Columns menu), Drawer (filter sidebar), Checkbox (column visibility, select all), Segmented Control (view switch) and Button. The package holds no primitives of its own, no native `<select>` or date input, no Tailwind and no table library.

### Grid

- UI SDK supplies the behaviour: `createVirtualizer` (measured variable heights, `onEnd` loads the next keyset page), `createGridFocus` and `createCellRange` (arrows, Home/End, Page keys, Shift ranges, copy as TSV across unmounted rows), `createSelection` (row checkboxes, Shift extends, select all loaded), `createReorder` (column headers, pointer and keyboard) and `bindDrag` (column resize).
- One part per row; cells are plain elements bound to the focus registry from the row's `bind`.
- Column state is one small array, `{ key, width, visible, pinned }[]`, in the package's own store. It persists through a host-supplied `ColumnPersistence` (`load` and `save`, sync or async); `localStorage` is the default. It is restored after mount, so the server render and the first client render agree.
- Pinned columns and the select column are `position: sticky`; the header row is sticky to the top. The Columns menu shows, hides and pins.
- Every mutable UI SDK object is read through `useSyncExternalStore` or a part's `state` / `children` function.

### Column resize

The handle on a header's right edge is a focusable `separator`. `bindDrag` tracks the pointer with a 3 px threshold and Escape to cancel. One pure rule serves pointer and keyboard: the new width is the start width plus the delta, clamped to 60–600 px. Arrow keys on the focused handle step 10 px, 50 px with Shift, and Escape restores the width the gesture started from.

### Status board

`StatusBoard` is one column per status over the `status_code =` shapes, so it stays inside the declared shapes: a region or channel filter narrows every column, a status filter leaves one column, and a quick filter, range or customer filter makes the board unavailable. Each column is its own keyset feed of 50 behind its own virtualiser. `createTransfer` moves a card by pointer or keyboard; `accepts` reads the transitions, so a column a status cannot move to is skipped, and a drop outside the column the card is shown in puts it back. A drop posts to the host, which updates the row only where its transitions allow it and answers 409 otherwise; the counter triggers then move the two counts and sums.

## Decisions

| Decision                                                                               | Why                                                                                         |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A range filter sits on the sort column only                                            | One index cannot serve a range on one column and an order on another                        |
| An equality filter takes one value, never a list                                       | `IN` over an ordered index needs a merge the index does not give                            |
| A nullable column is never a sort                                                      | The NULL-safe keyset predicate is an `OR`, which loses the index range scan on a deep page  |
| The quick filter returns 500 unordered rows and no cursor                              | A bitmap scan has no order; ordering it means a Sort over every match                       |
| The quick filter is refused past 120 ms                                                | Its cost follows the match count, so only a time budget bounds it                           |
| Setting the quick filter returns to the default sort                                   | A capped result has no order; a complete one is sorted in memory by the default sort first  |
| The quick filter covers customer name and order number, not email                      | `orders` carries no email column, and adding one would pass the demo database's 0.5 GB cap  |
| The live total orders its inner scan by the shape's index and runs with `enable_sort = off` | The plan is then always an index scan that stops at row 10,001; left alone the planner picks a sequential scan or a sort, bounded only by luck |
| Clearing a filter falls back: same sort, then the default sort, then the default query | The result must stay a declared shape                                                       |
| The URL carries the cursor the feed starts from                                        | A view is shareable; changing a filter or sort resets it                                    |
| Facet counts hide while another filter is active                                       | Only the per-status totals have a counter                                                   |
| The filter sidebar is a non-modal Drawer                                               | The grid stays in view and usable while filters change                                      |
| Grid rows use a behaviour-driven `role="checkbox"` cell, not a Checkbox per row        | One primitive instance per row costs frames; selection is UI SDK's `createSelection` either way |
| The exact count is unbounded but opt-in                                                | It never runs on the request path                                                           |
| The package is compiled with the React Compiler and ships no `useMemo`                 | A consumer's compiler does not reach into `node_modules`                                    |
| The demo dataset is 620,000 orders on Neon, with the 10M run local                     | The Free plan caps a project at 0.5 GB and 10M orders with their indexes are 6.9 GB         |

## Cost at scale

- **Storage per shape.** At 10M orders the heap is 1.7 GB and nine ordered shape indexes are about 510 MB each; the trigram index was 237 MB over one column. Indexes scale with the table: at 620,000 rows the same ratio holds, {{STORAGE_NOTE}}. Roughly three times the heap for nine ordered shapes is why shapes are declared deliberately, per grid, and never generated per column.
- **Write amplification.** Each insert maintains every shape index plus the primary key, eleven index writes here, and each status change rewrites the indexes that carry `status_code`. Write cost is proportional to the shape count.
- **Counters.** One counter-row upsert per insert or delete, two per change of status or total. The counter row is a hot row under concurrent writes to one status, and two concurrent status moves in opposite directions take their row locks in opposite order.
- **Rollout.** Indexes ship as migrations. `CREATE INDEX` on a populated table should be `CONCURRENTLY`; the generated file uses `IF NOT EXISTS` and leaves that choice to the host. The 10M build took 117 s for all ten.
- **Request path.** One interaction is one indexed page read, one capped count and one total, each bounded by the page size or the cap.
- **The weak point.** The quick filter is bounded by a timeout, not by the index, and its threshold falls as the table grows. On a wide table at scale, search a narrow table and feed the result into an equality shape, as the demo's customer picker does.

## Benchmarks

`bun run --filter demo db:bench`: 30 runs per query after 3 warm-ups. Time is planning plus execution from `EXPLAIN (ANALYZE)`, so it is server-side and excludes the network. Each table shows the slowest variant per shape. The pass bar is p95 under 150 ms, an index scan, no Seq Scan and no Sort node.

### Neon, 620,000 orders

{{BENCH_NEON}}

### Local, 10,000,000 orders

Measured on the proof of concept this library came from: embedded Postgres 18.6 with 2 GB shared buffers on the build machine, the dataset since deleted. It predates the quick-filter shape and the live total, so its last row is the single-column name search the quick filter replaced. All 60 queries passed; [`apps/demo/db/bench-results-local-10m-poc.md`](apps/demo/db/bench-results-local-10m-poc.md) holds each one with its plan.

| Shape                                           | Page variants                          | Worst page p50 / p95 (ms) | Worst capped count p50 / p95 (ms) | Plan              |
| ----------------------------------------------- | -------------------------------------- | ------------------------- | --------------------------------- | ----------------- |
| no filter, sort `created_at`                    | first and deep, both directions, range | 0.66 / 1.96               | 2.71 / 3.74                       | Index Scan        |
| no filter, sort `total`                         | first and deep, both directions, range | 0.76 / 2.10               | 1.56 / 2.00                       | Index Scan        |
| `status_code =`, sort `created_at`              | first and deep, both directions, range | 0.82 / 1.50               | 2.29 / 2.58                       | Index Scan        |
| `status_code =`, sort `total`                   | first and deep, both directions, range | 0.64 / 1.13               | 2.11 / 2.89                       | Index Scan        |
| `customer_id =`, sort `created_at`              | first and deep, both directions        | 0.56 / 0.75               | 2.17 / 2.57                       | Index Scan        |
| `region =`, sort `created_at`                   | first and deep, both directions, range | 0.55 / 0.70               | 2.27 / 2.70                       | Index Scan        |
| `channel =`, sort `created_at`                  | first and deep, both directions        | 0.64 / 0.95               | 2.30 / 2.68                       | Index Scan        |
| `status_code =`, `region =`, sort `created_at`  | first and deep, both directions        | 0.59 / 0.80               | 2.20 / 2.79                       | Index Scan        |
| `status_code =`, `channel =`, sort `created_at` | first and deep, both directions        | 0.60 / 0.87               | 2.33 / 2.80                       | Index Scan        |
| `customer_name contains` (POC name search)      | five terms                             | 127.52 / 131.75           | none                              | Bitmap Index Scan |

- A deep page started 2,000,000 rows into the result and cost the same as the first page.
- Search by term, p95: `Smith` 9.2 ms; `Zanele Dlam` 71.1 ms; `Mokoena` 114.5 ms; `mok` 131.8 ms when answered, refused in 28 of 33 runs; `a M` refused in all 33. A refused run is the server returning 400 at the 120 ms budget.
- Ordered shapes cost the same at 620,000 and at 10,000,000 rows. Substring search does not: sixteen times the data was ten to twenty times the time.

## Walkthrough

{{WALKTHROUGH}}

## Develop

```bash
bun install
```

```bash
bun run typecheck
```

```bash
bun run lint
```

```bash
bun run test
```

```bash
bun run dev
```

The demo needs `apps/demo/.env.local` holding `QUERY_GRID_DATABASE_URL`, a direct Postgres 18 connection string (see `apps/demo/.env.example`). It serves on port 3040.

| Script (`bun run --filter demo …`) | What                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `db:setup`                         | schema, seed (620,000 orders and 30,000 customers by default), generated DDL, vacuum      |
| `db:migrate`                       | the schema and the generated DDL only, no seeding                                         |
| `db:generate`, `db:check`          | writes, or checks, `db/migrations/0002_query_grid.sql` from the grid def                  |
| `test`                             | def validity, the control enumeration, migration parity (no database)                     |
| `test:db`                          | indexes and triggers exist, keyset pages are gap-free, counters and totals stay exact     |
| `db:bench`                         | p50 and p95 of every shape with `EXPLAIN (ANALYZE)`, written to `db/bench-results.md`     |

## Releasing

The package is built and packed from `packages/query-grid`; `prepack` builds `dist` and copies this README and the LICENSE beside it.

```bash
npm login
```

```bash
npm org ls kikstart
```

```bash
cd packages/query-grid && npm publish --access public
```

The `@kikstart` scope must exist on npm first: create the `kikstart` organisation at <https://www.npmjs.com/org/create>, or publish under a user scope by changing `name`. To cut a later version, bump `version` in `packages/query-grid/package.json`, commit, tag `v<version>` and publish again.

## Verification record

{{VERIFICATION}}

## Licence

MIT. See [LICENSE](LICENSE).
