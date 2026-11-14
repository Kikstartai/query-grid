# query-grid

A composable filter and data grid for very large Postgres tables, built on [UI SDK](https://ui-sdk.dev). You declare the query shapes your indexes serve. The controls offer exactly those, and the server refuses everything else.

Live demo: https://query-grid.vercel.app

## Principles

1. **The UI reflects what the data layer can do.** A filter, sort or combination is offered only when an index answers it fast, and the server refuses any other.
2. **Composition, not a monolith.** Filtering and the grid are separate parts around one query state.
3. **Very large data sets are never a constraint.**

## Packages

Three packages, released together at the same version.

| Package                         | Depends on           | Holds                                                                                                                                 |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `@kikstart/query-grid`          | nothing              | the core: the query contract, URL codec, validation, offers, feeds, the data source contract. No React, no DOM, no `pg`               |
| `@kikstart/query-grid-react`    | core, React, UI SDK  | controlled base components, the provider and hooks, and the same components bound to the query state                                  |
| `@kikstart/query-grid-postgres` | core                 | the server: declared shapes, the SQL builder, keyset paging, index and counter DDL, and one request handler. No React, no `pg` either |

There is one query contract, in core. The React package encodes a query with core's `encodeQuery`, the Postgres package decodes it with core's `decodeQuery`, and both validate with core's `validateQueryValues`.

| Entry point                                  | Holds                                                                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `@kikstart/query-grid`                       | field and query types, `Capabilities`, URL codec, validation, actions and offers, the stores and feeds, chips, formatting, problem codes      |
| `@kikstart/query-grid/http`                  | `createHttpSource`, the wire types, the route names and the error body it shares with `createGridHandler`                                     |
| `@kikstart/query-grid/memory`                | `createMemorySource` and `memoryCapabilities`                                                                                                 |
| `@kikstart/query-grid-react`                 | `QueryGridProvider`, the hooks, `useOfferState`, `ClientFieldDef`                                                                             |
| `@kikstart/query-grid-react/components`      | the controlled base components, `QueryGridMessagesProvider`, `useMessages`                                                                    |
| `@kikstart/query-grid-react/ui`              | the same components, by the same names, bound to the provider                                                                                 |
| `@kikstart/query-grid-react/styles.css`      | layout and look for the package's own elements, on UI SDK's `--ui-*` tokens                                                                   |
| `@kikstart/query-grid-postgres`              | `createGridHandler`, shapes and `validateGridDef`, the SQL builder and runner, the keyset cursor, `generateGridMigration`, `listMissingIndexes` |
| `@kikstart/query-grid-postgres/capabilities` | `capabilities(shapes)` alone, safe to import in the browser                                                                                   |

## Install

```bash
npm install @kikstart/query-grid @kikstart/query-grid-react @kikstart/query-grid-postgres @ui-sdk/core@beta @ui-sdk/react@beta
```

React 19 and UI SDK `0.1.0-beta.1` or later are peer dependencies of the React package. Every package ships ESM and type declarations; the React package is compiled with the React Compiler.

Import UI SDK's stylesheet once at the app entry, then the package's, in that order:

```ts
import "@ui-sdk/core/web.css";
import "@kikstart/query-grid-react/styles.css";
```

`web.css` gives every UI SDK component its look and defines the `--ui-*` tokens. The package does not import it for you: it belongs to the app, like any other UI SDK stylesheet, and sits in `@layer ui-sdk`. Put `@layer ui-sdk;` at the top of your global stylesheet so your own rules always win.

## Quick start

Declare the fields once, in a module with no React in it. Both the server and the client import it, so their keys and types cannot drift. The library has no domain names of its own; a host passes its defs in.

```ts
// orders-fields.ts
import type { GridDef } from "@kikstart/query-grid";
import type { QueryShape } from "@kikstart/query-grid-postgres";

export const ORDERS_BASE: GridDef = {
  id: "orders",
  defaultSort: { field: "created_at", direction: "desc" },
  facet: { field: "status_code" },
  total: { field: "total" },
  fields: [
    { key: "id", label: "ID", type: "id", operators: [], hidden: true },
    {
      key: "order_number",
      label: "Order",
      type: "integer",
      operators: [],
      pinned: true,
    },
    {
      key: "created_at",
      label: "Created",
      type: "datetime",
      operators: ["range"],
    },
    {
      key: "status_code",
      label: "Status",
      type: "enum",
      operators: ["eq"],
      options: STATUSES,
    },
    { key: "customer_name", label: "Customer", type: "text", operators: [] },
    { key: "total", label: "Total", type: "money", operators: ["range"] },
  ],
};

export const ORDERS_SHAPES: QueryShape[] = [
  { equals: [], sort: "created_at", range: true },
  { equals: ["status_code"], sort: "created_at", range: true },
  { equals: ["status_code"], sort: "total", range: true },
  { quick: ["customer_name", "order_number"] },
];
```

The server def is those fields plus storage: the table, the shapes and the counter table.

```ts
// orders-server-def.ts
import type { ServerGridDef } from "@kikstart/query-grid-postgres";

export const ORDERS_SERVER_GRID: ServerGridDef = {
  ...ORDERS_BASE,
  table: "orders",
  shapes: ORDERS_SHAPES,
  facet: { field: "status_code", counterTable: "order_status_counts" },
};
```

Generate the DDL from it: one index per shape, then the counter table and its triggers. `listTableMigrations` takes every server def you have and returns one migration per table.

```ts
import { listTableMigrations } from "@kikstart/query-grid-postgres";

for (const migration of listTableMigrations([ORDERS_SERVER_GRID])) {
  writeFileSync(
    `migrations/0002_query_grid_${migration.table}.sql`,
    migration.sql,
  );
}
```

Run its statements one at a time, outside a transaction (`psql -f` does; or send each of `migration.steps` on its own): the indexes are built `CONCURRENTLY`, and the counter steps open their own short transactions.

Serve it with one handler. The executor is yours; the handler validates the shape before any SQL exists.

```ts
// app/api/orders/[[...route]]/route.ts
import {
  createGridHandler,
  type SqlExecutor,
} from "@kikstart/query-grid-postgres";

const execute: SqlExecutor = async (sql) =>
  (await pool.query(sql.text, sql.values)).rows;

const handle = createGridHandler({
  def: ORDERS_SERVER_GRID,
  execute,
  basePath: "/api/orders",
});

export const GET = (request: Request) => handle(request);
export const POST = (request: Request) => handle(request);
```

`createGridHandler` takes a fetch-standard `Request` and returns a `Response`, so it runs under Next.js, Hono, Bun or a Worker. It answers the routes `createHttpSource` calls:

| Route              | Answers                                                                         | From                         |
| ------------------ | ------------------------------------------------------------------------------- | ---------------------------- |
| `GET /`            | a keyset page: `{ rows, nextCursor, hasNext }`; `limit` sets the page size      | built in                     |
| `GET /count`       | `{ count, capped, source }`; `exact=1` asks for the exact count                 | built in                     |
| `GET /total`       | `{ available, sum, rows, source }` or `{ available: false, code, params }`      | built in                     |
| `GET /facets`      | `[{ value, count, sum }]` from the counter table; it ignores the query          | built in                     |
| `GET /options`     | `[{ value, label }]` for a lookup field (`field`, `query`, `value`)             | the `options` hook           |
| `GET /transitions` | `[[from, to]]`, for the board                                                   | the `moves.transitions` hook |
| `POST /status`     | `{ id, to }` moves one row and returns it, for the board                        | the `moves.change` hook      |

- A refusal is a 400, a refused transition a 409, an omitted hook or an unknown route a 404, the wrong method a 405 and anything else a 500 that carries no detail.
- Every error body is `{ error, message, code, params }`. `code` and `params` are what the client renders through its messages; `message` is the code and its params as one log line. No English crosses the wire.
- `limit` is parsed: a value that is not a positive integer is a 400 `invalid_limit`, never `LIMIT NaN`, and a large one is capped at 1,000.
- Responses carry `cache-control: no-store` and `server-timing`.
- With `basePath` the routing is exact. Without it the last path segment picks the route.

The client def is the same fields plus cells, and the capabilities derived from the same shapes:

```tsx
// orders-grid-def.tsx
import { capabilities } from "@kikstart/query-grid-postgres/capabilities";
import type { ClientGridDef } from "@kikstart/query-grid-react";

export const ORDERS_GRID: ClientGridDef = {
  ...ORDERS_BASE,
  fields: ORDERS_BASE.fields.map(addCells),
};

export const ORDERS_CAPABILITIES = capabilities(ORDERS_SHAPES, {
  facetField: "status_code",
});
```

Mount the parts. Each one reads and writes the same query state; mount as many or as few as you need.

```tsx
"use client";

import { QueryGridProvider } from "@kikstart/query-grid-react";
import {
  CountDisplay,
  DataGrid,
  FacetPanel,
  FilterBar,
  FilterChips,
  FilterSidebar,
  TotalFooter,
} from "@kikstart/query-grid-react/ui";

export function Orders({ search }: { search: string }) {
  return (
    <QueryGridProvider
      def={ORDERS_GRID}
      search={search}
      basePath="/api/orders"
      capabilities={ORDERS_CAPABILITIES}
    >
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

`search` is the page's query string at first render. `def.id` names the grid: it keys the column state the provider keeps in `localStorage`.

The provider keeps the URL and the query state in step, both ways:

- A filter, sort, view or reset is a new history entry (`history.pushState`), so Back steps through them. Applying the quick filter replaces the current entry instead.
- On Back and Forward the provider decodes the URL, falls back to the default query if no shape answers it, and loads the result into the store; the data stores refetch as they do for any change.
- It also follows a `search` prop that changes, and the address bar after a navigation it did not make, such as a `<Link>` to the same route. Its own writes never echo back, because it acts only when the URL and the store disagree.
- Column layout stays out of the URL. `syncUrl={false}` turns the mirroring off; the `search` prop is still followed.

## Capabilities

The client def carries no table, no shapes and no counter table. What the client needs to know about the server arrives as one small object:

```ts
interface Capabilities {
  mode: "server" | "memory";
  isAnswerable(query: QueryState): boolean;
  sortFields: string[];
  quickFields: string[];
  isFacetCountShown(query: QueryState): boolean;
}
```

- `capabilities(shapes, { facetField })` builds it from the same shapes the server enforces, so the controls offer exactly what the handler accepts. It is computed once per def.
- `memoryCapabilities(def, quickFields)` builds it from the field operators for the in-memory source.
- Everything in the client that used to read shapes reads this instead: the provider's URL guard, `applyAction`, `listOffers`, the sort control, the quick filter, the facet panel and the board.

## The two patterns

- **The SQL executor is a Strategy.** `SqlExecutor` is one function, `(sql, settings?) => Promise<rows>`. The runner decides what to run and under which statement budget; the host decides how: `pg`, a serverless driver, a tenant router, a read replica. A value in `sql.values` is a string or, for several values of one field, an array of strings. The client's `DataSource` is the same pattern one layer up: `createHttpSource` and `createMemorySource` are two strategies behind the same parts.
- **The defs are models the engine reads.** Fields, shapes, the facet and the total are plain data. The offers, the SQL, the DDL, the chips and the controls are all derived from them, so the design is metadata-driven and a host can build its defs from its own database or configuration at runtime. The library accepts a def as input and never imports one.

## Base components

`@kikstart/query-grid-react/components` holds the components with nothing under them: props in, callbacks out, no provider, no query state, no URL and no server. A control takes `disabled` and a `reason`; an option may carry them too.

```tsx
import { DataGrid, FacetPanel } from "@kikstart/query-grid-react/components";

<FacetPanel
  label="Kind"
  options={kinds}
  values={selected}
  onValuesChange={setSelected}
  multiple
/>
<DataGrid
  fields={fields}
  rows={rows}
  hasNext={false}
  onEndReached={loadMore}
  loading={false}
/>
```

| Component                                                 | Takes                                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `DataGrid`                                                | `fields`, `rows`, `hasNext`, `onEndReached`, `loading`; optionally `error`, `sort` and `onSortChange`, header `filters`, column state |
| `CardList`                                                | the same row window, plus `titleField` and `badgeField`                                                                              |
| `StatusBoard`                                             | generic `lanes`, `onMove(id, to, { from, index })` and `canMove(from, to)`                                                           |
| `FilterBar`, `FilterSidebar`                              | children; the sidebar also takes `side: "start" \| "end"`, `activeCount` and `onReset`                                               |
| `FieldFilter`                                             | a `field`, with `values` and `onValuesChange` or `range` and `onRangeChange`; `multiple`; `loadOptions` for a lookup                 |
| `SortControl`, `QuickFilter`                              | options or a value, and one change callback                                                                                          |
| `FilterChips`                                             | `chips`, `onRemove(chipId, valueId?)`, `onReset`                                                                                     |
| `FacetPanel`                                              | `options` with counts, `values`, `onValuesChange`, `multiple`                                                                        |
| `ViewSwitch`, `ColumnsMenu`, `CountDisplay`, `TotalFooter` | a value and, where it changes, a callback                                                                                            |

- **Column state** (order, width, visibility, pin) is internal to `DataGrid` by default. Pass `columns` and `onColumnsChange` to control it, or `columnPersistence` (`load` and `save`, sync or async) to keep the internal state somewhere.
- **`StatusBoard`** moves a card at once and calls `onMove`. If `onMove` returns a promise that rejects, the board puts the card back.
- **`./ui` holds one bound wrapper per base component, under the same name.** A wrapper reads the provider and renders the base component; none of the base component files imports a provider hook.

The demo's [`/components`](https://query-grid.vercel.app/components) route is these components over sixty rows in a constant and two `useState` calls.

## Localization

Every visible string and `aria-label` comes from one messages object. English is built in; with no provider a component renders English.

```tsx
import { QueryGridMessagesProvider } from "@kikstart/query-grid-react/components";

<QueryGridMessagesProvider
  messages={{
    noRows: "Geen rye nie.",
    rows: ({ count, formatted, locale }) =>
      `${formatted} ${selectPlural(locale, count, { one: "ry", other: "rye" })}`,
    errors: { too_broad: () => "Daardie soekterm is te breed." },
  }}
>
  <Orders />
</QueryGridMessagesProvider>
```

- `useMessages()` merges the provider's messages over the defaults, so an override names only what it changes. Base components and bound wrappers read the same object; the query provider takes no messages.
- **Plurals** go through `Intl.PluralRules`, and lists through `Intl.ListFormat`. `selectPlural(locale, count, forms)` is exported for your own messages.
- **Core and the server speak codes, never English.** A refusal reason is `{ code, field, filters, range, sort }`; a `QueryRejected`, a failed request and an unavailable total are `{ code, params }`; a chip is data. The React package turns each into a sentence through `messages.reasons` and `messages.errors`. A host's own code, thrown from an `options` or `moves` hook as `new QueryRejected(error, code, params)`, renders through `messages.errors[code]`.
- **Locale** flows through `def.format.locale` and `def.format.currency`, as before.
- Only English ships.

## Right to left

The components follow the page's direction. Nothing is configured.

- Pinned columns, the select column and virtual rows are placed with `inset-inline-start`; the stylesheet uses logical properties throughout.
- A column resize reads the direction when the gesture starts: in a right-to-left grid the handle sits on a header's left edge, dragging left widens the column, and the arrow keys swap.
- Column reorder, the roving focus and the drawer come from UI SDK and already mirror. `FilterSidebar` takes `side: "start" | "end"`.
- Every piece of text a component renders is isolated with `<bdi>`, so a left-to-right value inside a right-to-left grid keeps its own order.

The demo's [`/rtl`](https://query-grid.vercel.app/rtl) route is the orders grid under `dir="rtl"`.

## Several values per field

Filters are AND-combined, and there is no OR across fields. Within one field, equality takes several values.

- `QueryState.equals` is `Record<string, string[]>`. In the URL a field repeats: `?f.status_code=paid&f.status_code=shipped`.
- The SQL is `t.status_code = ANY($1::text[])` with one array parameter; one value stays `= $1`. Nothing is concatenated.
- A field takes at most `maxValues` values, 20 unless the field says otherwise. Core validates it, `applyAction` refuses to pass it, and the server refuses it with `too_many_values` and the cap in `params`.
- A shape accepts several values on its equality fields unless it sets `multi: false`. Capabilities then offer one value only for it, and `Offers.multi` lists the fields that take several right now.
- An equality control is a UI SDK Select in `multiple` mode, or a Combobox with chips for a lookup field. `FilterChips` shows one chip per field, listing its values, each with its own remove button.
- Several values of the facet field read the sum of their counters, for the count, the total and the facet panel. The board shows one lane per selected value.
- The in-memory source matches any of the values.

## Styling

Two stylesheets, one set of tokens.

- **`@ui-sdk/core/web.css`** styles every UI SDK component the package renders: Select, Combobox, Date Picker and its calendar, Number Input, Input, Popover, Drawer, Checkbox, Segmented Control and Button. It reads about 36 `--ui-*` custom properties: background, foreground, muted, border, input, primary, destructive, ring, radius, spacing, font size and fonts.
- **`@kikstart/query-grid-react/styles.css`** covers only what `web.css` does not: the grid, its rows, cells, header and resize handle, the card list, the board, the chips, the facets, the count and total, and the layout of the filter bar and sidebar. It defines no tokens of its own; it reads the same `--ui-*` properties. The look of UI SDK components is left to `web.css`: the only rules that touch them size the controls inside the filter bar and flatten the buttons the package uses as facets, header sorts, pins and chip removers. Every selector sits inside `:where()`, so it has no specificity and any rule of yours wins.
- Layout the grid cannot work without (sticky and absolute positioning, widths, flex) is inline.

So a restyle is mostly repointing tokens. This is the whole stylesheet behind the demo's [`/restyled`](https://query-grid.vercel.app/restyled) route, 33 lines, with nothing changed in the package:

```css
.restyled {
  --ui-background: #fffbeb;
  --ui-foreground: #0f172a;
  --ui-muted: #fde68a;
  --ui-muted-foreground: #475569;
  --ui-border: #0f172a;
  --ui-input: #0f172a;
  --ui-primary: #0f172a;
  --ui-primary-foreground: #fffbeb;
  --ui-ring: #f59e0b;
  --ui-ring-border: #0f172a;
  --ui-radius: 0;
  --ui-font-size: 0.75rem;
  --ui-font-sans: var(--font-mono);
  background: var(--ui-background);
  color: var(--ui-foreground);
  font-family: var(--ui-font-sans);
}

.restyled .qg-header-cell {
  background: var(--ui-foreground);
  color: var(--ui-background);
  text-transform: uppercase;
}

.restyled .qg-row {
  border-bottom-style: dashed;
}

.restyled .qg-header-sort[data-sorted],
.restyled .qg-header-sort[data-sorted] .qg-icon {
  color: var(--ui-ring);
}
```

The demo site wears kikstart's brand the same way: [`apps/demo/src/app/globals.css`](apps/demo/src/app/globals.css) points fifteen `--ui-*` tokens at kikstart's colours, radius and Geist fonts, and nothing else. The packages ship no brand.

To go further than tokens, target the hooks:

- Every UI SDK part carries its `data-slot` (`select-trigger`, `drawer-content`, `calendar-day`) and state attributes (`data-open`, `data-highlighted`, `data-disabled`, `data-checked`).
- The package's own elements carry stable `qg-` classes (`qg-row`, `qg-cell`, `qg-header-cell`, `qg-chip`, `qg-facet`, `qg-card`, `qg-board-card`) and the grid's state attributes (`data-active`, `data-selected`, `data-pinned`, `data-unavailable`).

`web.css` follows the system colour scheme. A light-only app sets `color-scheme: light` on `:root`, as the demo does.

## Using the hooks alone

The hooks in `@kikstart/query-grid-react` are complete without `./ui`. Build your own controls on them:

```tsx
"use client";

import {
  QueryGridProvider,
  useFeedState,
  useOffers,
  useQueryDispatch,
  useQueryGrid,
  useQueryState,
} from "@kikstart/query-grid-react";

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
          aria-pressed={query.equals.status_code?.includes(option.value)}
          onClick={() =>
            dispatch({
              type: "setEquals",
              field: "status_code",
              values: [option.value],
            })
          }
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
        <button disabled={!hasNext} onClick={feed.loadMore}>
          More
        </button>
      </li>
    </ul>
  );
}
```

| Hook                                              | Gives                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `useQueryState`, `useQueryDispatch`               | the query and the one way to change it                                             |
| `useOffers`, `useQueryRules`                      | which filters, ranges, sorts and quick filter are answered now, and which take several values |
| `useOfferState`                                   | whether one control is offered, and the sentence that says why not                 |
| `useFeedState`                                    | the loaded rows, paging status and whether the result was capped                   |
| `useCountState`, `useTotalState`, `useFacetState` | count, total and facet counts, each fetched only once something reads it           |
| `useFilterChips`                                  | one entry per active filter and the sort: the chip as data, and its labelled item  |
| `useColumns`                                      | column order, widths, visibility and pinning, and the laid-out columns             |
| `useGridView`, `useQueryGrid`                     | the current view and the stores themselves                                         |

Without React at all, core is the whole model: `createQueryStore`, `createFeed`, `createCountStore`, `listOffers` and `applyAction` are plain functions over an emitter, and `explainUnavailable(query, target, rules)` returns the reason a control is unavailable as a code and the fields that block it. For a host's own export, `useQueryState()` is the query, `useColumns().layout` the visible columns in order, and `walkGridPages(def, execute, query)` on the server yields every page of the result by keyset.

## The in-memory data source

`createMemorySource(def, rows, { quick, transitions })` from `@kikstart/query-grid/memory` runs the same parts and hooks over rows already loaded in full. It filters, sorts, counts and totals in JavaScript. Shapes do not apply: its capabilities come from the field operators, so every declared filter and sort is offered in any combination, with several values per field, and the facet counts follow the other filters. `quick` lists the fields the quick filter searches; without it there is no quick filter.

```tsx
import { createMemorySource } from "@kikstart/query-grid/memory";

const source = createMemorySource(TASKS_GRID, rows, {
  quick: ["title", "assignee"],
  transitions,
});

<QueryGridProvider def={TASKS_GRID} search={search} source={source}>
```

A source carries its own capabilities, so the provider needs no `capabilities` prop here. It is meant for small lists: up to a few thousand rows. Every change filters and sorts the whole array, which is instant at 400 rows (the demo's [`/memory`](https://query-grid.vercel.app/memory) route) and still under a frame at 5,000. Past that, give the table shapes and an index.

## Design as built

### Field defs and query shapes

One field description drives the grid and the filters. Core's `FieldDef` carries `key`, `label`, `type`, the filter `operators` it supports (`eq`, `range`), `options`, a `lookup` for large option lists, `maxValues`, `nullable` and layout hints (`width`, `pinned`, `hidden`, `wrap`). The React package's `ClientFieldDef` extends it with `cell`, so the server never sees React. A core `GridDef` is an `id`, the fields, the default sort, the facet field, the total field and the format.

The server def then declares its **query shapes**. A shape is the unit the data layer answers, because a filter plus a sort is fast only when one index serves both:

- an ordered shape is a set of equality filters, one sort, optionally a range on that sort column, and `multi: false` when its equality fields take one value only
- the quick-filter shape is a list of columns matched by substring

The demo's orders grid declares ten:

| Shape                                             | Index                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| no filter, sort `created_at`, range               | `(created_at, id)`                                                    |
| no filter, sort `total`, range                    | `(total, id)`                                                         |
| `status_code =`, sort `created_at`, range         | `(status_code, created_at, id)`                                       |
| `status_code =`, sort `total`, range              | `(status_code, total, id)`                                            |
| `customer_id =`, sort `created_at`                | `(customer_id, created_at, id)`                                       |
| `region =`, sort `created_at`, range              | `(region, created_at, id)`                                            |
| `channel =`, sort `created_at`                    | `(channel, created_at, id)`                                           |
| `status_code =`, `region =`, sort `created_at`    | `(status_code, region, created_at, id)`                               |
| `status_code =`, `channel =`, sort `created_at`   | `(status_code, channel, created_at, id)`                              |
| quick filter over `customer_name`, `order_number` | GIN `((customer_name \|\| ' ' \|\| order_number::text) gin_trgm_ops)` |

`validateGridDef` rejects a shape that sorts on a nullable field, repeats another shape, names an operator its field does not offer or puts a timestamp in the quick filter, and requires the default sort with no filter to be a shape.

### One shape, one index

- `generateGridMigration` derives the DDL: equality columns, then the sort column, then `id`; one trigram GIN index over the quick-filter columns joined with spaces; then the counter table, its functions and its three triggers. The file is safe to re-run. `listGridMigrationSteps` gives the same thing as steps to send one at a time, and `listTableMigrations(defs)` merges every def on a table into one migration, with an index two defs share written once.
- **Indexes are built `CONCURRENTLY`**, each as its own statement outside any transaction, so a build never blocks writes. `{ concurrently: false }` turns that off for a migration runner that insists on one transaction.
- **The counter backfill takes no lock across its scan.** It runs in three short steps. The first installs the triggers in a mode that logs each change to a `_pending` table. The second reads the whole table in one `REPEATABLE READ` snapshot, writes the counts, and deletes the logged changes it can see, which are exactly the ones already in its snapshot. The third folds the changes logged since into the counters and switches the triggers to write there directly. The table lock is held for the trigger swap and for the fold, never for the scan, and a test runs the three steps with writes between each and a transaction open across the scan.
- **A name past Postgres's 63 characters is shortened**, to its first 54 characters and an eight-character hash of the whole name. Postgres would otherwise truncate it silently, two long names could collide, and the second `IF NOT EXISTS` would do nothing. `validateGridDefs(defs)` checks every def and that no index name is declared with two definitions.
- `listMissingIndexes` compares the def with `pg_indexes` by method and column order, not by name; a partial index does not count, and neither does one a failed concurrent build left invalid, when the caller passes `valid`. `listCounterObjects` names the counter table's columns, functions and triggers for the same check.
- `matchShape` decides whether a query is declared. The set of equality fields must match exactly, a range must sit on the sort column of a shape that allows it, several values need a shape that has not opted out, and the quick filter combines with no other filter.
- `capabilities(shapes)` wraps the same function for the client, so the two cannot disagree.

### The UI offers only declared shapes

Every bound control renders from `listOffers(def, query, rules)` and writes through `applyAction`, which refuses an action whose result the capabilities do not answer. `rules` is the capabilities plus whether a quick-filter result is complete. Choosing sort `total` disables region, channel and customer; choosing a status leaves only the sorts a status shape supports. A disabled control carries the reason from `explainUnavailable`, rendered through the messages: in its `title` in the filter bar, as text in the sidebar. `enumerateReachableStates` walks the same two functions from the default query, with one and with several values per field, and a test asserts that every reachable state is a declared shape and every declared shape is reachable.

### The server refuses the rest

`buildPageSql`, `buildCappedCountSql`, `buildExactCountSql` and `buildCappedTotalSql` call `assertDeclared` before any SQL exists. An undeclared shape, an unknown field, a value outside its type, more values than a field's cap or an undecodable cursor throws `QueryRejected`, which carries a code and params and which `createGridHandler` returns as a 400. Values are bound parameters; identifiers come only from the def and must be plain. A page is capped at 1,000 rows per request whatever the client asks for.

### Keyset paging

A page is `SELECT … FROM orders t WHERE <filters> AND (t.<sort>, t.id) < ($a, $b) ORDER BY t.<sort> DESC, t.id DESC LIMIT n + 1`. The extra row says whether a next page exists and never reaches the client. There is no offset anywhere, so a deep page costs the same as the first. Timestamps cross the wire as microsecond ISO strings so a cursor round-trips exactly. `walkGridPages` is the same loop as an async generator, for a host's export.

### Quick filter

The quick filter is `(<columns joined with spaces>) ILIKE '%term%'` through the trigram GIN index, with `enable_seqscan = off`. It is the one shape whose cost follows the match count rather than the page size, so:

- the server gives it a 120 ms statement budget and refuses a term that exceeds it with a 400 `too_broad`
- it returns at most 500 rows, unordered, with no cursor
- every other filter is disabled while it is active
- when all matches arrive under the cap, the client sorts them in memory and the sort controls come back; over the cap they stay disabled, with the reason

### Query state

`createQueryStore` is one external store in core holding the equality filters, the range, the quick filter, the sort, the keyset cursor and the view. `QueryGridProvider` creates it from the URL and builds the stores beside it that subscribe to it: the row feed (`createFeed`), the count, the total, the facet counts and the lookup labels from core, and the column state. Each starts fetching only when a part subscribes. The stores are plain emitters read through `useSyncExternalStore`; no component holds a copy of the query, and the base components never see a store.

### Counts

- An unfiltered or status-only query reads the counter table: exact, one row per status, summed over the selected statuses.
- Any other query counts inside `LIMIT 10001` and shows `10 000+` above the cap.
- The exact count runs only from the Exact count button, under a 60 s statement timeout.
- The facet panel shows counts only while no filter other than status is active, because no counter answers the rest.

### Totals

The footer totals the def's `total` field, and only in the two cases an index or a counter answers:

- **From the counter table.** The filter is a declared grouping (nothing, or one or more statuses): the counter table's `total_sum` is a read of one row per status.
- **Live, under the cap.** The filtered result has at most 10,000 rows: one query sums `total` over the shape's index scan, which stops at row 10,001.

Any other filter shows `No total for this filter` with the reason, which the server sends as `over_cap` and the cap. The counter table is maintained by three row triggers, on insert, delete and update of the status or the total.

### Parts

| Part                                                      | Reads                                           | Writes                                     |
| --------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------ |
| `FilterBar` (`QuickFilter`, `FieldFilter`, `SortControl`) | query, offers, capabilities                     | filters, sort                              |
| `FilterSidebar`                                           | query, offers, with each reason shown           | filters, sort                              |
| `FilterChips`                                             | query                                           | clears one filter, the sort, or everything |
| header sort and filter controls                           | query, offers                                   | sort, filters                              |
| `FacetPanel`                                              | query, offers, facet counts                     | status filter                              |
| `CountDisplay`                                            | count store                                     | exact-count request                        |
| `TotalFooter`                                             | total store                                     | –                                          |
| `DataGrid`, `ColumnsMenu`                                 | feed, query, column state                       | sort, filters, column state                |
| `CardList`                                                | feed                                            | –                                          |
| `StatusBoard`                                             | query, facet counts, one keyset feed per status | the status of one row, through the server  |
| `ViewSwitch`                                              | view                                            | view                                       |

The table is the bound wrappers in `./ui`. Each renders the base component of the same name from `./components` with props read from the provider.

### Controls

Every control is a UI SDK component: Select, in `multiple` mode where a field takes several values (status, region, channel, sort), Combobox with async options and chips (the customer picker), Date Picker in range mode (created), Number Input (total range), Input (quick filter), Popover (header filters, Columns menu), Drawer (filter sidebar), Checkbox (column visibility, select all), Segmented Control (view switch) and Button. The package holds no primitives of its own, no native `<select>` or date input, no Tailwind and no table library.

### Grid

- UI SDK supplies the behaviour: `createVirtualizer` (measured variable heights, `onEnd` loads the next keyset page), `createGridFocus` and `createCellRange` (arrows, Home/End, Page keys, Shift ranges, copy as TSV across unmounted rows), `createSelection` (row checkboxes, Shift extends, select all loaded), `createReorder` (column headers, pointer and keyboard) and `bindDrag` (column resize).
- One part per row; cells are plain elements bound to the focus registry from the row's `bind`.
- Column state is one small array, `{ key, width, visible, pinned }[]`. The base grid holds it itself unless it is given `columns` and `onColumnsChange`; under the provider it lives in one store, so the grid and a `ColumnsMenu` mounted elsewhere share it. It persists through a host-supplied `ColumnPersistence` (`load` and `save`, sync or async); under the provider `localStorage` is the default, keyed by `def.id`. It is restored after mount, so the server render and the first client render agree.
- Pinned columns and the select column are `position: sticky` on `inset-inline-start`; the header row is sticky to the top. The Columns menu shows, hides and pins.
- Every mutable UI SDK object is read through `useSyncExternalStore` or a part's `state` / `children` function.

### Column resize

The handle on a header's inline-end edge is a focusable `separator`. `bindDrag` tracks the pointer with a 3 px threshold and Escape to cancel. One pure rule serves pointer and keyboard: the new width is the start width plus the delta, clamped to 60–600 px, with the delta's sign and the arrow keys flipped when the grid runs right to left. Arrow keys on the focused handle step 10 px, 50 px with Shift, and Escape restores the width the gesture started from.

### Status board

The base `StatusBoard` knows lanes, `onMove` and `canMove` and nothing else. The bound one is one lane per status over the `status_code =` shapes, so it stays inside the declared shapes: a region or channel filter narrows every lane, a status filter leaves the selected lanes, and a quick filter, range or customer filter makes the board unavailable. Each lane is its own query store and keyset feed of 50, built in the wrapper, behind its own virtualiser. `createTransfer` moves a card by pointer or keyboard; `accepts` reads the transitions, so a column a status cannot move to is skipped, and a drop outside the column the card is shown in puts it back. A drop posts to the host, which updates the row only where its transitions allow it and answers 409 otherwise; the counter triggers then move the two counts and sums.

## Decisions

| Decision                                                                                                     | Why                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| A range filter sits on the sort column only                                                                  | One index cannot serve a range on one column and an order on another                                                                           |
| An equality filter takes up to `maxValues` values, and a shape can refuse more than one                      | `= ANY` over an ordered index is fast only when the planner can still read the order from an index; the benchmark decides per shape              |
| Filters are AND-only, with no OR across fields                                                               | An OR across columns has no single index to answer it                                                                                          |
| The contract lives in one React-free core that both other packages import                                    | The encoder and the decoder cannot drift, and the server installs no React                                                                     |
| Core and the server send codes and params, never sentences                                                   | The words belong to the app's language, and only the React package knows it                                                                    |
| Base components take props and know no query                                                                 | They are usable for any list, and the constraint is one layer on top instead of a condition inside every part                                  |
| A nullable column is never a sort                                                                            | The NULL-safe keyset predicate is an `OR`, which loses the index range scan on a deep page                                                     |
| The quick filter returns 500 unordered rows and no cursor                                                    | A bitmap scan has no order; ordering it means a Sort over every match                                                                          |
| The quick filter is refused past 120 ms                                                                      | Its cost follows the match count, so only a time budget bounds it                                                                              |
| Setting the quick filter returns to the default sort                                                         | A capped result has no order; a complete one is sorted in memory by the default sort first                                                     |
| The quick filter covers customer name and order number, not email                                            | `orders` carries no email column, and adding one would pass the demo database's 0.5 GB cap                                                     |
| The live total orders its inner scan by the shape's index and runs with `enable_sort = off`                  | The plan is then always an index scan that stops at row 10,001; left alone the planner picks a sequential scan or a sort, bounded only by luck |
| Clearing a filter falls back: same sort, then the default sort, then the default query                       | The result must stay a declared shape                                                                                                          |
| The URL carries the cursor the feed starts from                                                              | A view is shareable; changing a filter or sort resets it                                                                                       |
| A filter, sort or view change is a new history entry; the quick filter replaces the current one              | Back should undo the last deliberate change, not every search term tried on the way                                                            |
| URL history is the provider's own forty lines on `pushState` and `popstate`, not a routing library           | The codec is already core's and shared with the server; a library would add a second one, a peer dependency and an adapter in every host       |
| The counter backfill reads one snapshot instead of working in batches                                        | It is exact with no table lock; batches would need a watermark every write reads for ever                                                      |
| Facet counts hide while another filter is active                                                             | Only the per-status totals have a counter                                                                                                      |
| The filter sidebar is a non-modal Drawer                                                                     | The grid stays in view and usable while filters change                                                                                         |
| Grid rows use a behaviour-driven `role="checkbox"` cell, not a Checkbox per row                              | One primitive instance per row costs frames; selection is UI SDK's `createSelection` either way                                                |
| The exact count is unbounded but opt-in                                                                      | It never runs on the request path                                                                                                              |
| UI SDK components keep UI SDK's own stylesheet; the package styles only its own elements, on `--ui-*` tokens | A consumer restyles by repointing one set of tokens instead of overriding the package's selectors                                              |
| The package is compiled with the React Compiler and ships no `useMemo`                                       | A consumer's compiler does not reach into `node_modules`                                                                                       |
| The demo dataset is 620,000 orders on Neon, with the 10M run local                                           | The Free plan caps a project at 0.5 GB and 10M orders with their indexes are 6.9 GB                                                            |

## Cost at scale

- **Storage per shape.** At 10M orders the heap is 1.7 GB and nine ordered shape indexes are about 510 MB each; the trigram index was 237 MB over one column. Indexes scale with the table: at 620,000 rows the same ratio holds, 108 MB of heap under 336 MB of indexes: 24 MB for a two-column shape index, 39 MB for a four-column one and 32 MB for the quick-filter trigram index over two columns. Roughly three times the heap for nine ordered shapes is why shapes are declared deliberately, per grid, and never generated per column.
- **Write amplification.** Each insert maintains every shape index plus the primary key, eleven index writes here, and each status change rewrites the indexes that carry `status_code`. Write cost is proportional to the shape count.
- **Counters.** One counter-row upsert per insert or delete, two per change of status or total. The counter row is a hot row under concurrent writes to one status, and two concurrent status moves in opposite directions take their row locks in opposite order.
- **Rollout.** Indexes ship as migrations, built `CONCURRENTLY`, so a build takes roughly twice as long as a plain one and never blocks writes; a build that fails leaves an invalid index to drop before the next run. The counter backfill is one snapshot read of the table, with two brief table locks around it. The 10M build took 117 s for all ten indexes, built plainly.
- **Many tables.** Every shape is an index and every facet is three row triggers, on every table that has a grid. That is the price of principle 1, not a defect: two hundred tables with ten shapes each are two thousand indexes to build, store and write through. The tooling takes all the defs at once and gives one migration per table, but nothing makes the indexes cheaper. Declare a shape because a screen needs it.
- **Several values per field.** `= ANY` has no single index order to read. The planner either walks the sort index and filters, which is fast when the values are common, or collects the matches from the equality index and sorts them, which is fast when they are few. Between the two the cost grows with about the square root of the table. At 620,000 rows every case is a few milliseconds; a shape whose page misses the budget on your data is declared `multi: false`.
- **Request path.** One interaction is one indexed page read, one capped count and one total, each bounded by the page size or the cap.
- **The weak point.** The quick filter is bounded by a timeout, not by the index, and its threshold falls as the table grows. On a wide table at scale, search a narrow table and feed the result into an equality shape, as the demo's customer picker does.

## Benchmarks

`bun run --filter demo db:bench`: 30 runs per query after 3 warm-ups. Time is planning plus execution from `EXPLAIN (ANALYZE)`, so it is server-side and excludes the network. Each table shows the slowest variant per shape. The pass bar is p95 under 150 ms, an index scan, no Seq Scan and no Sort node.

### Neon, 620,000 orders

Postgres 18.7 on a Neon Free-plan compute, 0.25 to 2 CU, measured 2026-11-14. All 72 queries pass; [`apps/demo/db/bench-results.md`](apps/demo/db/bench-results.md) holds each one with its plan.

| Shape                                             | Page variants                          | Worst page p50 / p95 (ms) | Worst capped count p50 / p95 (ms) | Worst live total p50 / p95 (ms) | Plan              |
| ------------------------------------------------- | -------------------------------------- | ------------------------- | --------------------------------- | ------------------------------- | ----------------- |
| no filter, sort `created_at`                      | first and deep, both directions, range | 2.04 / 2.33               | 4.36 / 8.60                       | 12.06 / 19.69                   | Index Scan        |
| no filter, sort `total`                           | first and deep, both directions, range | 1.23 / 1.94               | 4.39 / 6.38                       | 2.61 / 2.71                     | Index Scan        |
| `status_code =`, sort `created_at`                | first and deep, both directions, range | 1.15 / 1.41               | 2.80 / 4.31                       | 12.29 / 16.65                   | Index Scan        |
| `status_code =`, sort `total`                     | first and deep, both directions, range | 1.09 / 2.18               | 2.78 / 2.99                       | 2.95 / 3.22                     | Index Scan        |
| `customer_id =`, sort `created_at`                | first and deep, both directions        | 0.92 / 1.08               | 2.74 / 3.00                       | 12.75 / 14.57                   | Index Scan        |
| `region =`, sort `created_at`                     | first and deep, both directions, range | 0.93 / 1.13               | 2.77 / 3.91                       | 12.59 / 16.59                   | Index Scan        |
| `channel =`, sort `created_at`                    | first and deep, both directions        | 0.89 / 1.12               | 6.17 / 6.90                       | 12.17 / 19.35                   | Index Scan        |
| `status_code =`, `region =`, sort `created_at`    | first and deep, both directions        | 0.96 / 1.14               | 2.88 / 3.04                       | 12.26 / 13.28                   | Index Scan        |
| `status_code =`, `channel =`, sort `created_at`   | first and deep, both directions        | 1.01 / 1.13               | 2.85 / 3.02                       | 13.00 / 26.08                   | Index Scan        |
| quick filter over `customer_name`, `order_number` | 8 terms                                | 15.29 / 19.23             | none                              | none                            | Bitmap Index Scan |

- A deep page starts 200,000 rows into the result, or 20,000 or 1,000 where the filter leaves fewer, and costs the same as the first page.
- The live total is the capped sum behind the footer: an index scan that stops at row 10,001, run with `enable_sort = off`. Its plan is an Index Scan or Index Only Scan on the shape's own index in every case.
- Quick filter by term, p95: `12345` 0.6 ms, `Smith` 3.0 ms, `Mokoena` 7.9 ms, `Zanele Dlam` 8.0 ms, `ena 4` 10.8 ms, `mok` 10.8 ms, `a M` 19.2 ms.
- `---` holds no trigram the index can use, so it would recheck every row. The server refused it at the 120 ms budget in all 33 runs. That is the refusal the budget exists for.

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

Captured with agent-browser at 1500 by 900 from the deployed demo, https://query-grid.vercel.app.

![Landing page](docs/screenshots/01-landing.png)

The landing page: what the library is, the three principles, the install line, the GitHub link and the live routes, in kikstart's brand.

![Default grid](docs/screenshots/02-default-grid.png)

The default query: the filter bar, the always-visible chip row, the status facets with counts from the counter table, the exact count, the first keyset page and the footer total. Total's range inputs are disabled because the sort is Created.

![Filter sidebar](docs/screenshots/03-filter-sidebar.png)

The filter sidebar, a non-modal Drawer: one control per filterable field over the same query state. Region is set, so the controls no index combines with it are disabled.

![Chips and Reset](docs/screenshots/04-chips-reset.png)

One chip per active filter and one for the sort, each with its own remove button, and Reset for the lot.

![Disabled controls with reasons](docs/screenshots/05-disabled-with-reasons.png)

Status Paid sorted by Total. Region, Channel, Customer, the Created range and the quick filter are disabled, and each says which index is missing.

![Capped count, no total](docs/screenshots/06-capped-count-no-total.png)

A range on Total has no counter, so the count stops at `10 000+` and offers the exact count. More than 10,000 rows match, so the footer says no total is available and why.

![Exact count](docs/screenshots/07-exact-count.png)

The exact count runs only after the button is pressed: 10,874 rows.

![Live total](docs/screenshots/08-total-live.png)

A week of Paid orders is 1,701 rows, under the cap, so the footer sums them live in one bounded query.

![Total from the counter table](docs/screenshots/09-total-from-counter.png)

A status alone is a declared grouping: the count and the total are a one-row read of the trigger-maintained counter table.

![Quick filter, answered](docs/screenshots/10-quick-filter-answered.png)

The quick filter matched 34 orders across customer name and order number. Every match is loaded, so the sort is offered and runs in memory, here by Total; every other filter is disabled.

![Quick filter, refused](docs/screenshots/11-quick-filter-refused.png)

The term `---` gives the trigram index nothing to narrow, so the server refuses it at its 120 ms budget with a 400 and the grid, count and total say so.

![Header filter](docs/screenshots/12-header-filter.png)

A header carries its own filter popover and sort button, drawn from the same offers as the filter bar. The filter is a UI SDK Select inside a Popover.

![Columns menu](docs/screenshots/13-columns-menu.png)

The Columns menu shows, hides and pins columns with UI SDK Checkboxes; the state is one small array persisted through the host's save and load functions.

![Range selection](docs/screenshots/14-range-selection.png)

A 5 by 4 cell range made with Shift and the arrow keys; Ctrl+C copies it as TSV.

![Resize and pinned column](docs/screenshots/15-resize-pinned-scrolled.png)

Customer resized from 200 to 300 px by dragging its handle, then the grid scrolled 520 px right and 600 px down: the select column, the pinned Order column and the header stay in place.

![List view](docs/screenshots/16-list-view.png)

The card list over the same query: the chips and the URL are unchanged by the switch.

![Status board](docs/screenshots/17-board.png)

One virtualised, keyset-paged column per status, each headed by its trigger-maintained count.

![Board drag](docs/screenshots/18-board-drag.png)

A Paid card dragged over Shipped: it has left its column and Shipped has opened a slot for it. Dropping it posts the status change, which the server checks against the transitions table.

![One part alone](docs/screenshots/19-part-facets-alone.png)

`/parts/facets` mounts the facet panel alone over the query state restored from the URL.

![In-memory route](docs/screenshots/20-in-memory.png)

The same parts over 400 rows held in the browser: two filters and a sort that no index would need to exist for, with the count, facet counts and total computed in JavaScript.

![Token restyle](docs/screenshots/21-token-restyle.png)

The same parts restyled by one 33-line stylesheet that repoints UI SDK's `--ui-*` tokens and adds three grid rules: every control, popup and the grid change, the package does not.

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

| Script (`bun run --filter demo …`) | What                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `db:setup`                         | schema, seed (620,000 orders and 30,000 customers by default), generated DDL, vacuum  |
| `db:migrate`                       | the schema and the generated steps, one statement at a time, no seeding               |
| `db:generate`, `db:check`          | writes, or checks, one `db/migrations/0002_query_grid_<table>.sql` per table from the server defs |
| `test`                             | def validity, the control enumeration with one and several values, migration parity (no database) |
| `test:db`                          | indexes and triggers exist, keyset pages are gap-free, counters and totals stay exact, several values per field |
| `db:bench`                         | p50 and p95 of every shape with `EXPLAIN (ANALYZE)`, with one value and with several, written to `db/bench-results.md` |

`bun run test` also runs each package's own tests: core's actions, URL codec, validation and in-memory source; the postgres package's shapes, SQL builder, handler and its offers over core; and the React package's column rules, a standalone mount of every base component, and the messages.

## Releasing

The three packages are released together at one version, core first because the other two depend on it by exact version. Each is built and packed from its own folder; `prepack` builds `dist` and copies the LICENSE beside it. Core also takes this README; the other two carry their own.

```bash
npm login
```

```bash
npm org ls kikstart
```

```bash
cd packages/query-grid && npm publish --access public
```

```bash
cd packages/query-grid-postgres && npm publish --access public
```

```bash
cd packages/query-grid-react && npm publish --access public
```

The `@kikstart` scope must exist on npm first: create the `kikstart` organisation at <https://www.npmjs.com/org/create>, or publish under a user scope by changing each `name`. To cut a later version, bump `version` in all three `package.json` files and the `@kikstart/query-grid` dependency in the other two, commit, tag `v<version>` and publish again in the same order.

## Verification record

Every row was observed on the Neon project (620,000 orders, 30,000 customers, 461 MB, Postgres 18.7). The browser rows were run twice with the same script: against the production build locally, then against the deployed demo at https://query-grid.vercel.app, with the same observations. The numbers refer to the Definition of Done.

| #     | Item                                                     | Command                                                                                                                                                                                              | Observation                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Builds, typechecks, lints, tests                         | `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`                                                                                                                                 | all clean for the package and the demo; 59 package tests and 3 demo tests pass; `next build` compiles every route                                                                                                                                                                                                                                                                                                                                              |
| 2     | DDL generated from the `GridDef`                         | `db:generate`, `db:check`, `db:migrate`                                                                                                                                                              | ten indexes, the counter table, its functions and three triggers generated into `0002_query_grid.sql`; the check passes; applied to Neon in 3.8 s                                                                                                                                                                                                                                                                                                              |
| 2     | `pg_indexes` check                                       | `test:db`                                                                                                                                                                                            | every declared shape has its index; the counter table has its columns and `orders` its three triggers                                                                                                                                                                                                                                                                                                                                                          |
| 2     | A missing index fails by name                            | `DROP INDEX orders_qs_region__created_at`, `test:db`, `db:migrate`, `test:db`                                                                                                                        | 1 fail naming `orders_qs_region__created_at`; after the rebuild 10 pass                                                                                                                                                                                                                                                                                                                                                                                        |
| 3     | The UI offers only declared shapes                       | `bun run test`                                                                                                                                                                                       | for the test def and the orders def, with the quick result complete and capped: every reachable control state matches a shape and every shape is reached                                                                                                                                                                                                                                                                                                       |
| 3     | The server refuses the rest                              | `curl /api/orders?f.channel=web&sort=total.desc`; `?f.status_code=nope`; `?limit=100000`                                                                                                             | 400 `undeclared_shape`; 400 `invalid_value`; 200 with 1,000 rows, the per-request cap                                                                                                                                                                                                                                                                                                                                                                          |
| 4     | Benchmark on Neon at 620,000                             | `db:bench`                                                                                                                                                                                           | 72 of 72 pass: worst ordered page p95 2.33 ms, worst capped count 8.60 ms, worst live total 26.08 ms, every one an index scan with no Sort; quick filter answered in at most 19.23 ms or refused at the 120 ms budget                                                                                                                                                                                                                                          |
| 5     | Capped count, then exact                                 | Paid, Total R 200 to R 600; Exact count                                                                                                                                                              | `10 000+ rows`, capped; then `10 874 rows`, exact                                                                                                                                                                                                                                                                                                                                                                                                              |
| 5     | Counts from the counter table                            | default query; status Paid                                                                                                                                                                           | `620 000 rows` and `62 275 rows`, each exact from the counter table; facet counts shown, and hidden once another filter is active                                                                                                                                                                                                                                                                                                                              |
| 5     | Totals                                                   | status Paid; Paid in a week of Created; Paid with a Total range                                                                                                                                      | R 6 702 835,27 from the counter table; R 198 603,69 summed live over 1,701 rows; no total, with "More than 10 000 rows match and no counter totals this filter."                                                                                                                                                                                                                                                                                               |
| 5     | Counter sums stay exact                                  | `test:db`                                                                                                                                                                                            | the counter table equals `count(*)` and `sum(total)` `GROUP BY status_code`; inserts, a status move, a total change, a move with a total change, an unrelated update and deletes keep both exact                                                                                                                                                                                                                                                               |
| 6     | No own primitives, native controls, Tailwind or TanStack | `grep -rnE '<(select\|input\|button\|textarea)\b\|type="date"' packages/query-grid/src`; `grep -rniE 'tailwind\|clsx\|tailwind-merge\|@tanstack\|components/ui\|shadcn\|lucide' packages/query-grid` | 0 lines each; `./ui` imports UI SDK Button, Checkbox, Combobox, Date Picker, Drawer, Input, Number Input, Popover, Segmented Control and Select                                                                                                                                                                                                                                                                                                                |
| 7     | Filter sidebar                                           | open it on Paid sorted by Total; toggle the direction; clear Status                                                                                                                                  | eight controls, five disabled with their reasons as text; both changes reach the shared query, the chips, the count and the URL                                                                                                                                                                                                                                                                                                                                |
| 7     | Chips and Reset                                          | Shipped and Gauteng; remove Region; Reset                                                                                                                                                            | three chips; the Region chip leaves and the counter count returns; Reset restores the default query and disables itself                                                                                                                                                                                                                                                                                                                                        |
| 7     | Quick filter                                             | `zanele dlamini`; sort by Total; `123456`; `mok`; `ab`; `---`                                                                                                                                        | 34 rows of one customer, sorted in memory; order 123456 alone; `500+ rows` with the sort disabled and its reason; a hint for two characters; refused with `too_broad`, for the page, the count and the exact count                                                                                                                                                                                                                                             |
| 7     | Customer picker                                          | type `mokoena` in the Combobox, pick the first; reload                                                                                                                                               | 20 customers offered from the server; 899 orders of one customer, a live total, the chip and the input showing the name; both restored from the URL after a reload                                                                                                                                                                                                                                                                                             |
| 8     | Resize rule                                              | `bun run test`                                                                                                                                                                                       | clamps at 60 and 600, both directions, a drag measured from the start width, 10 px and 50 px keyboard steps, Escape restoring the start width                                                                                                                                                                                                                                                                                                                  |
| 8     | Resize by mouse                                          | drag the Customer handle +100; drag -180 then Escape; drag +900                                                                                                                                      | 200 to 300 px in header and cells, saved; 120 px during the drag and 300 px after Escape; clamped at 600 px                                                                                                                                                                                                                                                                                                                                                    |
| 8     | Resize by keyboard                                       | focus the handle; Right; Shift+Left; Left twice; Escape; Shift+Right x7; Shift+Left x12                                                                                                              | 310, 260, 240, then 300 on Escape; clamped at 600 and at 60                                                                                                                                                                                                                                                                                                                                                                                                    |
| 8     | Resize persists                                          | reload                                                                                                                                                                                               | the 250 px width is restored in header and cells                                                                                                                                                                                                                                                                                                                                                                                                               |
| 8     | Resize while scrolled sideways                           | scroll 520 px right and 600 px down; drag the Region handle +80                                                                                                                                      | Region 150 to 230 px; the select column stays at x 1, the pinned Order column and its header at x 41, the header at y 1                                                                                                                                                                                                                                                                                                                                        |
| 9     | In-memory route                                          | `/memory`: Team Growth, Priority High, quick `fix`, sort Budget, Budget from $1,000                                                                                                                  | 400 rows, then 5 rows totalling $4,640.00, then 1 row totalling $1,590.00; facet counts follow the filters; no control is disabled; 0 requests to `/api`; the board shows the same rows                                                                                                                                                                                                                                                                        |
| 10    | Parts mount alone                                        | `/parts/<part>?f.status_code=refunded` for all nine parts                                                                                                                                            | each page mounts only its part and shows the shared query; a facet click on `/parts/facets` updates the query and the URL                                                                                                                                                                                                                                                                                                                                      |
| 10    | Grid, list and board keep the query                      | Region Gauteng; List; Board; Grid                                                                                                                                                                    | the chip and the URL survive each switch; seven board columns narrowed by region with counts hidden                                                                                                                                                                                                                                                                                                                                                            |
| 10    | URL round-trip                                           | open `/orders?f.status_code=shipped&f.region=gauteng&sort=created_at.asc&view=list`; open an undeclared URL                                                                                          | view, both filters, sort and direction restored; the undeclared URL falls back to the default query and the URL is rewritten                                                                                                                                                                                                                                                                                                                                   |
| 10    | Virtualised scroll and keyset paging                     | scroll to the end twelve times                                                                                                                                                                       | 6,500 rows in 13 keyset pages, 33 rows mounted, row heights 37 to 78 px with no gap or overlap                                                                                                                                                                                                                                                                                                                                                                 |
| 10    | Rows after an in-memory re-sort                          | quick filter `zanele dlamini`; sort Total twice, Created twice                                                                                                                                       | no gap or overlap between mounted rows in any of the five orders, with rows of 37, 78 and 98 px. The first deployed capture showed one tall row overlapping its neighbour; rows are now remounted and measured again whenever the query changes                                                                                                                                                                                                                |
| 10    | Arrow keys, range, TSV                                   | click, arrows, Shift+arrows, Ctrl+C, Home, End, Ctrl+Home, Ctrl+End                                                                                                                                  | a 4 by 4 range copies four TSV lines; Ctrl+End reaches row 499 and loads the next page                                                                                                                                                                                                                                                                                                                                                                         |
| 10    | Selection                                                | a row checkbox, a Shift-click, select all twice; Space on a focused row checkbox                                                                                                                     | 1, then rows 1 to 6, then 500, then 0; Space selects the row                                                                                                                                                                                                                                                                                                                                                                                                   |
| 10    | Column reorder                                           | Space, Right, Right, Space on Status; Space, Left, Escape; drag Region onto Created                                                                                                                  | header and body cells move together by keyboard and by pointer; Escape cancels                                                                                                                                                                                                                                                                                                                                                                                 |
| 10    | Pin and visibility                                       | Columns menu: hide Currency, show ID, pin Customer; reload; Reset columns                                                                                                                            | Currency leaves, ID joins, Customer moves beside Order and sticks at x 151; all three survive the reload; Reset restores the def's layout                                                                                                                                                                                                                                                                                                                      |
| 10    | Board moves                                              | Space, Left, Space on a Pending card; Space, Right, Escape on a Completed card; drag a Paid card onto Shipped                                                                                        | Pending 37,050 to 37,049 and Paid up one from the counter triggers; the Completed card skips to Refunded and Escape puts it back; the dragged card lands at index 3 and both counts move                                                                                                                                                                                                                                                                       |
| 10    | Board refusals                                           | drag a Paid card across Shipped onto Completed; release one in the gap between columns; `POST /api/orders/status` with a Completed order and `pending`                                               | the card returns to Paid both times and no count moves; 409 `transition_refused`                                                                                                                                                                                                                                                                                                                                                                               |
| 10    | Virtualised board columns                                | scroll the Completed column to its end six times                                                                                                                                                     | 350 cards loaded in keyset pages of 50, 16 mounted                                                                                                                                                                                                                                                                                                                                                                                                             |
| 10    | No errors                                                | agent-browser `errors` after the whole pass, locally and deployed; the `next start` log                                                                                                              | all empty                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 11    | Deployed on Vercel                                       | `vercel deploy --prod`; `curl` each route; the browser pass against the URL                                                                                                                          | https://query-grid.vercel.app is public: the landing page, `/orders` (grid, list, board), `/memory`, `/restyled` and `/parts/<part>` all answer 200; project `query-grid` in the `kikstartai` team, root `apps/demo`, linked to the GitHub repo, functions in `fra1` beside the database, the connection string a sensitive production env var                                                                                                                 |
| 12    | Public GitHub repo                                       | `gh repo create Kikstartai/query-grid --public --source . --remote origin --push`; `gh repo view`; `gh api …/license`                                                                                | https://github.com/Kikstartai/query-grid is public with `main` pushed; the README renders with its 21 screenshots and the licence is detected as MIT                                                                                                                                                                                                                                                                                                           |
| 13    | Publish-ready                                            | `npm pack --dry-run` in `packages/query-grid`; `node -e "import(...)"` of the three entries                                                                                                          | 80 files, 80.3 kB: `dist` with `.js`, `.d.ts` and `ui/styles.css`, the README and the LICENSE; all three entry points import in plain Node ESM                                                                                                                                                                                                                                                                                                                 |
| 14    | Screenshots                                              | agent-browser against the deployed demo                                                                                                                                                              | 21 captures in `docs/screenshots/`, embedded in the Walkthrough with what each proves                                                                                                                                                                                                                                                                                                                                                                          |
| 16    | Reviews                                                  | `/code-review`, `/security-review`, `/simplify`                                                                                                                                                      | code review: nine findings, all fixed (the quick exact count now runs under the quick budget; keyboard row selection; the date range end; the sort chip under a capped quick filter; five smaller ones). Security review: no finding at confidence 8 or above. Simplify: shared field helpers, one emitter, one store hook, cached offers, a cheaper in-memory sort and selection lookup, one page wrapper in the demo. Everything above was re-run afterwards |
| brand | kikstart branding in the demo                            | landing and app pages                                                                                                                                                                                | the mark and wordmark in both headers, "by kikstart" linking to https://kikstart.ai in header and footer, the icon as favicon and apple icon, Geist fonts and kikstart's colours and radius set through fifteen `--ui-*` tokens in the demo only                                                                                                                                                                                                               |
| style | Styling on UI SDK's stylesheet                           | `wc -l` before and after; the browser pass; `/restyled`                                                                                                                                              | `packages/query-grid/src/ui/styles.css` 1,101 to 631 lines, with no `--qg-*` token left and the look of every UI SDK component coming from `web.css`; `apps/demo/src/app/globals.css` 352 to 358; `apps/demo/src/app/restyled/restyled.css` 38 lines of Tailwind `@apply` to 33 lines of plain CSS, 13 of them token assignments. Row heights, column widths and every browser observation above are unchanged                                                 |

## Licence

MIT. See [LICENSE](LICENSE).
