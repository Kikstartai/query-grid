# query-grid design

query-grid is a filter and data grid for very large tables. This document says how it is built. The README says how to use it and holds the benchmarks.

## Model

- **The UI reflects what the data layer can do.** A filter, a sort or a combination is offered only when the data can answer it fast, and the server refuses any other.
- **Allowed comes from the data alone.** On a server grid the declared query shapes say what can be filtered and sorted. On a client grid every field can be, in any combination. A field def says nothing about filtering.
- **Which filters show is a layout choice.** A filter bar or sidebar names the fields it shows. The def never does, so one grid can show three filters in its bar and eight in its sidebar.
- **An allowed filter the current query cannot use is disabled with its reason, never hidden.**
- **Composition, not a monolith.** The filter bar, sidebar, chips, facets, count, totals, grid, card list and board are separate parts around one query state. None owns it.
- **One def per grid.** An app declares each grid once, in one object, and each package reads its own slice of it.
- **Server and client.** A server grid reads its rows over HTTP and is limited by its shapes. A client grid holds its rows in memory and is not limited.
- **Very large data sets are never a constraint.** Every request is bounded by a page size, a cap or a time budget.

## Packages

Three npm packages in one repo, released together at one version.

| Package                         | Depends on          | Holds                                            |
| ------------------------------- | ------------------- | ------------------------------------------------ |
| `@kikstart/query-grid`          | nothing             | the core: the query contract, stores and sources |
| `@kikstart/query-grid-react`    | core, React, UI SDK | base components and the grid bound to the core   |
| `@kikstart/query-grid-postgres` | core                | the server: SQL, DDL and the request handler     |

- There is one query contract, in core. The other two packages import it and never copy it.
- Every symbol has one home. Nothing is exported from two entry points.
- Core imports no React, no DOM global and no `pg`. The Postgres package imports no React and no `pg`: the host passes it a function that runs SQL.
- The library has no domain names. A host passes its defs in.

### `@kikstart/query-grid`

| Export     | Holds                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.`        | field and grid def types, `QueryState`, `Capabilities`, query shapes and `shapeCapabilities`, the URL codec, value validation, actions and offers, refusal reasons, the query store, the row feed, the count, total, facet and label stores, the board model, chips, formatting, the `DataSource` contract, the wire result types and limits, problems as codes |
| `./http`   | `createHttpSource` and the protocol it shares with the handler: route names, parameter names, the error and move bodies                                                                                                                                                                                                                                         |
| `./memory` | `createMemorySource`, `memoryCapabilities`, `filterRows`                                                                                                                                                                                                                                                                                                        |

- The stores are plain objects with `subscribe` and a getter, built on one emitter. There is no store library.
- The count, totals and facet counts are one kind of resource: it follows the query store, starts on its first subscriber and aborts the request it replaces.

### `@kikstart/query-grid-react`

| Export         | Holds                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `./components` | controlled base components, `QueryGridMessagesProvider`, `useMessages`, `useLocale`, the column-state API, `FieldDef` and `GridDef` |
| `.`            | `QueryGridProvider`, `StaticQueryGridProvider` and the hooks                                                                        |
| `./ui`         | one bound wrapper per base component, under the same name                                                                           |
| `./styles.css` | the package's own styles                                                                                                            |

- A base component takes props and calls back. It imports no provider hook and knows no query, source, shape or URL. An option or a control may carry `disabled` and a `reason`.
- A bound wrapper reads the provider and renders the base component of the same name.
- Everything is built on UI SDK components and behaviours. There are no hand-written primitives, no native `<select>` or date input and no table library.
- `DataGrid` is a compound: `Root`, `Toolbar`, `Status`, `ColumnsMenu` and `Body`, with `<DataGrid />` as the default composition. It takes a row window: `rows`, `hasNext`, `onEndReached` and `loading`.
- Column state (order, width, visibility, pin) is internal by default and can be controlled. It persists through a `ColumnPersistence`; the provider's default is local storage keyed by the def's `id`.
- `StatusBoard` knows lanes, `onMove` and `canMove`. The lane feeds live in core's board model.
- The filter controls are `EqualsSelect`, `LookupFilter` and `RangeFilter`. The bound `FieldFilter` picks one from the capabilities, the field's `type` and its `options`.
- The bound `FilterBar` and `FilterSidebar` take `fields`, a list of field keys: the quick filter, the default control of each named field in that order, then the sort. Without it they show every filterable field. `children` replaces everything.
- `QueryGridProvider` keeps the query in the URL through nuqs, which is a peer dependency. `StaticQueryGridProvider` takes a `search` string and needs no adapter. `urlPrefix` namespaces one grid's keys, for two grids on a page.
- `styles.css` styles only the package's own elements, reads the `--ui-*` tokens of `@ui-sdk/core/web.css` and defines none.

### `@kikstart/query-grid-postgres`

| Part                | Holds                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| storage             | `PostgresGridDef`: the def plus `table` and `facet.counterTable`                                                   |
| validation          | `validateGridDef`, `validateGridDefs`, `describeShape`                                                             |
| SQL builder         | the page, row, count, total and facet statements; `assertDeclared` and `QueryRejected`                             |
| runner              | `listGridPage`, `walkGridPages`, `getGridCount`, `listGridTotals`, `listFacetCounts`                               |
| DDL                 | `generateGridMigration`, `listGridMigrationSteps`, `listTableMigrations`, `listShapeIndexes`, `listMissingIndexes` |
| `createGridHandler` | a fetch-standard `Request` in, a `Response` out                                                                    |

## The grid def

A host writes one object per grid and checks it with `satisfies GridDef & PostgresGridDef`.

| Type              | Package  | Adds                                             |
| ----------------- | -------- | ------------------------------------------------ |
| `BaseGridDef`     | core     | `id`, `fields`, `defaultSort`, `facet`, `totals` |
| `ShapedGridDef`   | core     | `shapes`                                         |
| `GridDef`         | React    | a `cell` on any field                            |
| `PostgresGridDef` | Postgres | `table` and `facet.counterTable`                 |

- A field is `key`, `label`, `type` (`id`, `text`, `enum`, `integer`, `money`, `datetime`), `nullable`, `options`, a `lookup` for a large option list, `maxValues`, `currency` on a money field, and the layout hints `width`, `pinned`, `hidden` and `wrap`.
- The React package ignores `table` and `counterTable`. The Postgres package ignores `cell`. The memory source ignores shapes and storage.
- `facet` names one field with options. `totals` lists the money or integer fields the footer sums.
- A shape is the unit the data layer answers: a set of equality fields and a sort, optionally with a range on the sort, or the columns of the quick filter. Each shape is one index.
- A shape's equality fields take several values each unless it sets `multi: false`.
- `validateGridDef` checks a def against Postgres's rules before any migration is written: among them, a total must be a non-null money or integer field named once, and a currency must be a code `Intl` knows.

## Capability contract

Capabilities are what a data source can answer. Every control reads them; nothing reads shapes or indexes directly.

```ts
interface Capabilities {
  mode: "server" | "memory";
  isAnswerable: (query: QueryState) => boolean;
  equalsFields: string[];
  rangeFields: string[];
  sortFields: string[];
  quickFields: string[];
  isFacetCountShown: (query: QueryState) => boolean;
}
```

- `shapeCapabilities(shapes, { facetField })` builds them for a server grid: every field in a shape's `equals`, the sort of every shape with `range`, every shape's sort, the quick shape's columns. `createHttpSource(def, basePath)` calls it, so the client offers exactly what the server accepts.
- `memoryCapabilities(def)` builds them for a client grid: a number or a date without options takes a range, any other field an equality, and every field sorts.
- `isAnswerable` is the answer for one query. The field lists are what could ever be asked.
- `QueryRules` is the capabilities plus whether a quick-filter result is complete.
- `listOffers(def, query, rules)` says what the next action may be. `applyAction` refuses an action whose result the capabilities do not answer. `explainUnavailable(query, target, rules)` gives the reason as a code.
- The control for a field follows from the capabilities, its `type` and its `options`: an equality field with options is a select, one without is a lookup, a range field is a range. A field in both gets the equality control.
- The URL keys a provider owns are the capabilities' fields. Any other parameter is left alone.

## Query state

```ts
interface QueryState {
  equals: Record<string, string[]>;
  range: { field: string; min: string | null; max: string | null } | null;
  quick: string | null;
  sort: { field: string; direction: "asc" | "desc" };
  cursor: string | null;
}
```

- Filters combine with AND. Within one field, equality takes several values, up to the field's `maxValues` (default 20). There is no OR across fields.
- One query holds at most one range, on its sort field for a server grid.
- The quick filter takes 3 to 80 characters and runs alone on a server grid.
- The URL is the source of truth: `f.<field>` repeated per value, `r.<field>=min..max`, `q`, `sort=<field>.<direction>` and `view`. Core's `encodeQuery` and `decodeQuery` are the only codec, in the browser and on the server.
- A filter, range, sort, view or reset pushes a history entry. The quick filter replaces. A URL nothing answers is rewritten to the default.
- Column layout stays out of the URL.

## Wire protocol

`createHttpSource` calls these routes and `createGridHandler` answers them. Both read the route and parameter names from `@kikstart/query-grid/http`.

| Route              | Answers                                                                                                                    | From                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `GET /`            | a keyset page: `{ rows, nextCursor, hasNext }`; `limit` sets the page size                                                 | built in                     |
| `GET /count`       | `{ count, capped, source }`; `exact=1` asks for the exact count                                                            | built in                     |
| `GET /total`       | one result per total field: `{ field, available: true, sum, rows, source }` or `{ field, available: false, code, params }` | built in                     |
| `GET /facets`      | `[{ value, count, sums }]` from the counter table, `sums` keyed by total field                                             | built in                     |
| `GET /options`     | `[{ value, label }]` for a lookup field                                                                                    | the `options` hook           |
| `GET /transitions` | `[[from, to]]`, for the board                                                                                              | the `moves.transitions` hook |
| `POST /status`     | `{ id, to }` moves one row and returns it                                                                                  | the `moves.change` hook      |

- The query travels as the same URL parameters the page uses.
- An error body is `{ error, message, code, params }`. `error` is the category, `code` the specific reason, `message` the code and its params for logs.
- A refusal is a 400, a refused transition a 409, an unknown route or an omitted hook a 404, a wrong method a 405, an aborted request a 499 and anything else a 500.
- Every response is `no-store` and carries `server-timing`.
- `limit` defaults to 200 and is capped at 1,000. A count is capped at 10,000 and a quick-filter result at 500 rows.
- `/facets` ignores the query: facet counts are whole-table counts.
- A total is unavailable per field, as `over_cap` with the cap.
- Every read runs under `request.signal`, which is the third argument of the host's `execute` and of the hooks.
- The server refuses before any SQL exists: `assertDeclared` rejects an undeclared shape, an unknown field, a value outside its type, more values than a field's cap and an undecodable cursor.

## Storage

- **One shape, one index.** An ordered shape is a btree over its equality columns, its sort and the key. The quick filter is one trigram index over the concatenated columns.
- **Paging is keyset**, on the sort and the key, in both directions.
- **One value is `= $n`; several are `= ANY($n)`** with one array parameter. SQL is never built from a value.
- **The counter table** holds one row per facet value: `row_count` and one `<field>_sum` column per total field. Three row triggers keep it current, on insert, delete and update of the facet field or of a total field.
- **Counts.** A query that filters on the facet alone reads the counter table. Any other is counted up to the cap, and the exact count is a separate request.
- **Totals.** A query that filters on the facet alone reads the counter table. Any other is summed live in one statement for every total field, over the shape's index scan, and only when at most 10,000 rows match.
- **The quick filter** runs under a 120 ms statement budget and answers `too_broad` past it.
- **The migration** is generated from the defs: one `CREATE INDEX CONCURRENTLY` per shape, then three counter steps. The first installs the triggers, which keep the counter table current and log each change. The second counts the table from one snapshot, with no table lock. The third replaces the counters with the count plus the changes logged since. A run that stops anywhere leaves the counters following every write, and resumes from the top or from the step that failed.
- **A total added to a def** is a new counter column. The migration is run again, and the new sum is exact once its third step has run.

## Localization

- **The locale is the app's.** `QueryGridMessagesProvider` takes `locale` (default `en`) and `messages`. Every count, sum, money value, date, plural and list a component renders is formatted in that locale (an integer field's own value, such as an order number, is shown as written), so messages and numbers cannot disagree. A def carries no locale.
- **The currency is the data's.** A money field carries its own `currency` (default `USD`), so two money fields of one grid can differ.
- **Every sentence a user reads comes from one messages object**, through `useMessages()`. English is built in, and with no provider a component renders English. An override names only what it changes, and a nested provider keeps the locale and the messages the outer one set and it does not name.
- **Core and the Postgres package emit codes and params, never English.** A refusal reason, a `QueryRejected`, a failed request and an unavailable total are codes; a chip is data. The React package turns each into a sentence.
- **Plurals** go through `Intl.PluralRules` and lists through `Intl.ListFormat`.
- **Right to left works.** The stylesheet uses logical properties only, inline layout uses `insetInlineStart`, column resize and drag follow the direction, and every message, count and formatted value sits inside `<bdi>`.
- **English that stays** is text no user reads: `validateGridDef` problems, `describeShape` and comments in generated SQL.

## Scale

- **Nothing grows with a tenant count.** This is library code. Capabilities are computed once per def.
- **Request path.** One interaction is one indexed page read, one capped count and one statement for every total. Each is bounded by the page size, the cap or a time budget.
- **Storage per shape.** Every shape is an index on every table that has a grid. Shapes are declared deliberately, per grid, and never generated per column.
- **Write amplification.** Each insert writes every shape index. Write cost is proportional to the shape count.
- **Counters.** A write costs one counter-row upsert per insert or delete, and two per change of the facet field or of a total field. Each extra total adds one counter-column update to that same upsert, not another statement. The counter row is a hot row under concurrent writes to one facet value.
- **Several values per field.** `= ANY` has no single index order to read, so the cost grows with the table. A shape whose page misses the budget is declared `multi: false`.
- **The quick filter** is bounded by its time budget, not by the index, and its threshold falls as the table grows.
- **Rollout.** Indexes are built `CONCURRENTLY` and never block writes. The counter backfill is one snapshot read of the table with two brief table locks around it.

## Invariants the tests hold

- Core imports no React, UI SDK, `pg` or DOM global and has no dependency.
- The Postgres package imports no React or `pg`, depends on core alone and defines no contract symbol of its own.
- No base component imports a provider hook or holds an English literal.
- A query encoded by core is decoded by the handler into the same SQL parameters.
- Every state reachable through the demo's offers matches a declared shape.

## Deferred

- A separate components npm package.
- Runtime add and remove of filters: a "+ Add filter" menu over the allowed fields, modelled on the columns menu and the column state, with the containers' `fields` as the initial list.
- A migration CLI. The demo has its own generator script.
- Generic status moves on the server beyond the `moves` hook.
- `createGridHandler` in core. Its built-in routes call the Postgres runner directly, so moving it needs an executor interface between the handler and a backend.
- A separate memory adapter package. It is the `./memory` subpath.
- Rows that mix currencies within one field. A money field has one currency.
