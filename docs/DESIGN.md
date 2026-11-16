# query-grid design

query-grid is a filter and data grid for very large tables. This document says how it is built. The README says how to use it and holds the benchmarks.

## Model

- **The UI reflects what the data layer can do.** A filter, a sort or a combination is offered only when the data can answer it fast, and the server refuses any other.
- **Allowed comes from the data alone.** On a server grid the declared indexes say what can be filtered and sorted. On a client grid every field can be, in any combination. A field def says nothing about filtering.
- **Which filters show is a layout choice.** A filter bar or sidebar names the fields it shows. The def never does, so one grid can show three filters in its bar and eight in its sidebar.
- **An allowed filter the current query cannot use is disabled with its reason, never hidden.**
- **Composition, not a monolith.** The filter bar, sidebar, chips, facets, count, totals, grid, card list and board are separate parts around one query state. None owns it.
- **One def per grid.** An app declares each grid once, in one object, and each package reads its own slice of it.
- **Server and client.** A server grid reads its rows over HTTP and is limited by its indexes. A client grid holds its rows in memory and is not limited.
- **Very large data sets are never a constraint.** Every request is bounded by a page size, a cap, a time budget or the narrowed-set limit.
- **Some operations run only over a narrowed set.** An OR across fields, a range no index bounds, a contains, and a group by a field no counter holds are answered over the rows the indexed filters leave, and only when those rows number at most `narrowLimit`. A control that needs a smaller set stays visible and says how large the set is.

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

| Export     | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.`        | field and grid def types, `QueryState`, `DataSourceCapabilities`, indexes, `indexCapabilities` and `planQuery`, the URL codec, value validation, reserved values and exclusion, date presets, `toLiteralQuery`, actions and offers, refusal reasons, the query store, the row feed, the count, total, facet, label, limits and narrowed-size stores, the board and grouping models, chips, formatting, the `DataSource` contract, the wire result types, `GridLimits`, problems as codes |
| `./http`   | `createHttpSource` and the protocol it shares with the handler: route names, parameter names, the error and move bodies                                                                                                                                                                                                                                                                                                                                                                  |
| `./memory` | `createMemorySource`, `memoryCapabilities`, `filterRows`                                                                                                                                                                                                                                                                                                                                                                                                                                 |

- The stores are plain objects with `subscribe` and a getter, built on one emitter. There is no store library.
- The count, totals and facet counts are one kind of resource: it follows the query store, starts on its first subscriber and aborts the request it replaces.

### `@kikstart/query-grid-react`

| Export         | Holds                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `./components` | controlled base components, `QueryGridMessagesProvider`, `useMessages`, `useLocale`, the column-state API, `FieldDef` and `GridDef` |
| `.`            | `QueryGridProvider`, `StaticQueryGridProvider` and the hooks                                                                        |
| `./ui`         | one bound wrapper per base component, under the same name                                                                           |
| `./styles.css` | the package's own styles                                                                                                            |

- A base component takes props and calls back. It imports no provider hook and knows no query, source, index or URL. An option or a control may carry `disabled` and a `reason`.
- A bound wrapper reads the provider and renders the base component of the same name.
- Everything is built on UI SDK components and behaviours. There are no hand-written primitives, no native `<select>` or date input and no table library.
- `DataGrid` is a compound: `Root`, `Toolbar`, `Status`, `ColumnsMenu` and `Body`, with `<DataGrid />` as the default composition. It takes a row window: `rows`, `hasNext`, `onEndReached` and `loading`.
- `DataGrid` also takes `groups`. Each group is a header row, the rows of an open group and a load-more row, all mixed into the one virtual list. The cell focus, the range and the selection run over the data rows alone, so the arrow keys step from row to row past a header, and a header is a button on its own tab stop.
- Column state (order, width, visibility, pin) is internal by default and can be controlled. It persists through a `ColumnPersistence`; the provider's default is local storage keyed by the def's `id`.
- `StatusBoard` knows lanes, `onMove` and `canMove`. The lane feeds live in core's board model.
- The filter controls are `EqualsSelect`, `LookupFilter`, `RangeFilter`, `ContainsFilter`, `MatchToggle` and `GroupControl`. The bound `FieldFilter` picks one of the first three from the capabilities, the field's `type` and its `options`.
- `EqualsSelect` and `LookupFilter` list `(empty)` and `(not empty)` first on a nullable field. `EqualsSelect` carries an Exclude toggle on a field with a fixed list of values. A date `RangeFilter` is a period select (Today to This year, then Custom…) that shows the date picker only for Custom.
- The bound `FilterBar` and `FilterSidebar` take `fields`, a list of field keys: the search, the default control of each named field in that order, then Contains, the Match toggle, the sort and the group. Without it they show every filterable field. `contains` names the text fields the Contains control lists, and defaults to `fields`. `children` replaces everything.
- `QueryGridProvider` keeps the query in the URL through nuqs, which is a peer dependency. `StaticQueryGridProvider` takes a `queryString` and needs no adapter. `urlPrefix` namespaces one grid's keys, for two grids on a page.
- `styles.css` styles only the package's own elements, reads the `--ui-*` tokens of `@ui-sdk/core/web.css` and defines none.

### `@kikstart/query-grid-postgres`

| Part                | Holds                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| storage             | `PostgresGridDef`: the def plus `table` and `facet.counterTable`                                                           |
| validation          | `validateGridDef`, `validateGridDefs`, `describeIndex`                                                                     |
| SQL builder         | the page, row, count, total, facet and group statements; `assertDeclared` and `QueryRejected`                              |
| runner              | `listGridPage`, `walkGridPages`, `getGridCount`, `listGridTotals`, `listFacetCounts`, `listGridGroups`, `getNarrowedSizes` |
| DDL                 | `generateGridMigration`, `listGridMigrationSteps`, `listTableMigrations`, `listIndexDdl`, `listMissingIndexes`             |
| `createGridHandler` | a fetch-standard `Request` in, a `Response` out                                                                            |

## The grid def

A host writes one object per grid and checks it with `satisfies GridDef & PostgresGridDef`.

| Type              | Package  | Adds                                             |
| ----------------- | -------- | ------------------------------------------------ |
| `BaseGridDef`     | core     | `id`, `fields`, `defaultSort`, `facet`, `totals` |
| `IndexedGridDef`  | core     | `indexes`                                        |
| `GridDef`         | React    | a `cell` on any field                            |
| `PostgresGridDef` | Postgres | `table` and `facet.counterTable`                 |

- A field is `key`, `label`, `type` (`id`, `text`, `enum`, `integer`, `money`, `datetime`), `nullable`, `options`, a `lookup` for a large option list, `maxValues`, `currency` on a money field, and the layout hints `width`, `pinned`, `hidden` and `wrap`.
- `nullable` is what makes a field optional: only such a field takes the empty and not-empty values.
- The React package ignores `table` and `counterTable`. The Postgres package ignores `cell`. The memory source ignores indexes and storage.
- `facet` names one field with options. `totals` lists the money or integer fields the footer sums.
- An index is the unit the data layer answers: a set of equality fields and a sort, optionally with a range on the sort. Each is one `CREATE INDEX`; the search's columns are `search` on the def, with one index of their own.
- An index's equality fields take several values each unless it sets `multi: false`.
- `validateGridDef` checks a def against Postgres's rules before any migration is written: among them, a total must be a non-null money or integer field named once, and a currency must be a code `Intl` knows.

## Data source capabilities

The capabilities are what a data source can answer fast. Every control reads them; nothing reads the indexes directly.

```ts
interface DataSourceCapabilities {
  holdsAllRows: boolean;
  searchIsOrdered: boolean;
  facetCountsFollowFilters: boolean;
  narrowLimited: boolean;
  matchAny: boolean;
  canRun: (query: QueryState) => boolean;
  isNarrowed: (query: QueryState) => boolean;
  narrowBasis: (query: QueryState) => string;
  equalsFields: string[];
  rangeFields: string[];
  containsFields: string[];
  groupFields: string[];
  sortFields: string[];
  searchFields: string[];
  isFacetCountExact: (query: QueryState) => boolean;
}
```

- `indexCapabilities(indexes, { facetField, searchFields, fields })` builds them for a server grid: every field in an index's `equals`, every index's sort, `searchFields`, and from `fields` every number and date as a range, every text field as a contains and every equality field but a bare id as a group. `createHttpSource(def, basePath)` calls it, so the client offers exactly what the server accepts.
- `memoryCapabilities(def)` builds them for a client grid: a number or a date without options takes a range, any other field an equality, a text field also a contains, and every field sorts.
- `planQuery(indexes, query)` splits a query into the core an index answers (the equality filters, the sort and a range on it) and the parts that run over that core's rows. `isNarrowed` says a query has such a part, or groups by a field other than the counted one. `narrowBasis` names the rows they run over, so a size known for one query answers another over the same rows.
- `canRun` is the answer for one query. The field lists are what could ever be asked.
- Flags say how the source behaves, never which kind it is: `holdsAllRows` (every row is in hand, so a board lane keeps the whole query), `searchIsOrdered` (search results sort like any query, rather than arriving as one capped unordered batch the feed sorts itself) and `facetCountsFollowFilters` (facet counts are recounted under the other filters, rather than read from the counter table) are true for the memory source and false for an index-backed one. `narrowLimited` is the reverse: an index-backed source limits the narrowed set and the memory source does not.
- `OfferContext` is the capabilities, whether every search match is loaded, and `narrowed`: the size of the rows the current filters leave, as the source last counted it.
- An action whose result is a narrowed query is offered only when that size is known and within the limit. A query already over a narrowed set may change its filters freely: the server decides, and a refusal shows in the grid with the limit.
- `listOffers(def, query, context)` says what the next action may be. `applyAction` refuses an action whose result the capabilities do not answer. `explainUnavailable(query, target, context)` gives the reason as a code.
- The control for a field follows from the capabilities, its `type` and its `options`: an equality field with options is a select, one without is a lookup, a range field is a range. A field in both gets the equality control.
- The URL keys a provider owns are the capabilities' fields. Any other parameter is left alone.

## Query state

```ts
interface QueryState {
  equals: Record<string, string[]>;
  ranges: {
    field: string;
    min: string | null;
    max: string | null;
    preset?: string;
  }[];
  contains: { field: string; value: string } | null;
  match: "all" | "any";
  search: string | null;
  sort: { field: string; direction: "asc" | "desc" };
  group: string | null;
  cursor: string | null;
}
```

- Filters combine with AND, or with OR under `match: "any"` once two fields are filtered. Within one field, equality takes several values, up to the field's `maxValues` (default 20).
- **Empty.** On a nullable field an equality filter takes two reserved values: `_empty` (no value) and `_not_empty` (any value). Empty mixes with real values ("Glen or nobody"); not empty stands alone.
- **Exclude.** On a field with a fixed list of values, `!value` in the filter leaves that value out. It is intent: the URL and the query keep it, and it becomes the remaining values (and empty, on a nullable field) when the query runs, so an option added later is included. It is refused when nothing would remain or more than `maxValues` would.
- **Ranges.** A query holds one range per field. On a server grid the one on the sort field of an index with `range` is answered by that index; any other runs over the narrowed set.
- **Presets.** A date range may carry a `preset` in place of its bounds (`today`, `yesterday`, `last-7-days`, `last-30-days`, `this-month`, `last-month`, `this-year`). It is intent too: resolved when the query runs to whole days in the viewer's time zone, both ends included.
- **Intent becomes literal filters at the source.** `withLiteralFilters` wraps a data source: every fetch sees literal values and bounds, and the capability checks (`canRun`, `isNarrowed`, `isFacetCountExact`, `narrowBasis`) see the same rewrite with a preset as an unbounded range. Both built-in sources are wrapped. The server never sees an excluded value or a preset name, and refuses both.
- **Contains** is a case-insensitive substring match on one text field. **Match any** ORs the field filters (equality, ranges and contains). **Group** names one field to group the grid by. On a server grid all three run over the narrowed set, except a group by the counted field.
- The search takes 3 to 80 characters. On a server grid it combines with equality filters on any indexed field, including empty and excluded values, and with nothing else.
- The search is an unranked, case-insensitive substring match (`ILIKE '%term%'`) over the def's `search` columns joined with spaces, backed by a `pg_trgm` GIN index. It is not full-text search: no stemming, no ranking, no order.
- The URL is the source of truth: `f.<field>` repeated per value (`f.status=!cancelled`, `f.owner=_empty`), `r.<field>=min..max` or `r.<field>=<preset>`, `c.<field>=text`, `match=any`, `group=<field>`, `q`, `sort=<field>.<direction>` and `view`. Core's `encodeQuery` and `decodeQuery` are the only codec, in the browser and on the server.
- A filter, range, sort, view or reset pushes a history entry. The search replaces. A URL nothing answers is rewritten to the default.
- Column layout stays out of the URL.

## Wire protocol

`createHttpSource` calls these routes and `createGridHandler` answers them. Both read the route and parameter names from `@kikstart/query-grid/http`.

| Route              | Answers                                                                                                                    | From                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `GET /`            | a keyset page: `{ rows, nextCursor, hasNext }`; `limit` sets the page size                                                 | built in                     |
| `GET /count`       | `{ count, capped, source }`; `exact=1` asks for the exact count                                                            | built in                     |
| `GET /total`       | one result per total field: `{ field, available: true, sum, rows, source }` or `{ field, available: false, code, params }` | built in                     |
| `GET /facets`      | `[{ value, count, sums }]` from the counter table, `sums` keyed by total field                                             | built in                     |
| `GET /groups`      | `{ groups: [{ value, label, count, capped, sums }], source, truncated }` for the query's `group`                           | built in                     |
| `GET /narrowed`    | `{ limit, all: { rows, over }, any }`: the rows the indexed filters leave, and the sum of the terms under match any        | built in                     |
| `GET /limits`      | the limits the handler runs under                                                                                          | built in                     |
| `GET /options`     | `[{ value, label }]` for a lookup field                                                                                    | the `options` hook           |
| `GET /transitions` | `[[from, to]]`, for the board                                                                                              | the `moves.transitions` hook |
| `POST /status`     | `{ id, to }` moves one row and returns it                                                                                  | the `moves.change` hook      |

- The query travels as the same URL parameters the page uses.
- An error body is `{ error, message, code, params }`. `error` is the category, `code` the specific reason, `message` the code and its params for logs.
- A refusal is a 400, a refused transition a 409, an unknown route or an omitted hook a 404, a wrong method a 405, an aborted request a 499 and anything else a 500.
- Every response is `no-store` and carries `server-timing`.
- `limit` defaults to 200 and is capped at 1,000. A count is capped at 10,000 and a search result at 500 rows. These, the search budget and the narrowed-set limit are `GridLimits`, set once on the handler (`limits`) or passed to a runner function. The browser holds no copy: a response carries the limit that shaped it, and `/limits` answers them all.
- A refusal over the narrowed-set limit is `narrow_first` with `rows` and `limit`.
- `/facets` ignores the query: facet counts are whole-table counts.
- A total is unavailable per field, as `over_cap` with the cap.
- Every read runs under `request.signal`, which is the third argument of the host's `execute` and of the hooks.
- The demo's executor starts each statement with a per-call marker, `/* qg:<uuid> */`, and cancels an aborted one through `pg_stat_activity` by that marker, from a one-connection pool of its own, and retries while the statement has not started. It never names a backend pid, so the cancel is correct behind any transaction pooler. Its 5 s statement budget is a `SET LOCAL` inside each statement's transaction, so a pooler that drops startup parameters still applies it.
- The server refuses before any SQL exists: `assertDeclared` rejects a query no index answers, an unknown field, a value outside its type, more values than a field's cap, an excluded value or a preset name, and an undecodable cursor.

## Storage

- **One declared index, one `CREATE INDEX`.** An ordered index is a btree over its equality columns, its sort and the key. The def's `search` is one trigram index over the concatenated columns.
- **Paging is keyset**, on the sort and the key, in both directions.
- **One value is `= $n`; several are `= ANY($n)`** with one array parameter. SQL is never built from a value.
- **The counter table** holds one row per facet value: `row_count` and one `<field>_sum` column per total field. Three row triggers keep it current, on insert, delete and update of the facet field or of a total field.
- **Counts.** A query that filters on the facet alone reads the counter table. Any other is counted up to the cap, and the exact count is a separate request.
- **Totals.** A query that filters on the facet alone reads the counter table. Any other is summed live in one statement for every total field, over the index scan, and only when at most 10,000 rows match. With one plain value per field the scan is read in sort order, with `enable_sort = off`, so it stops at row 10,001. Several values, not empty and match any are capped unordered instead, like the count: no index gives them an order, and an ordered walk would not stop when few rows match.
- **Match any** reads its rows first, behind `OFFSET 0`, and sorts them after, for the same reason.
- **The search** runs under a 120 ms statement budget and answers `too_broad` past it. An equality filter beside it is one more clause on the same statement: the planner reads the trigram index, the filter's index or both. No extra index is built for the combination.
- **Empty values.** `_empty` is `IS NULL`, `_not_empty` is `IS NOT NULL`, and empty beside real values is `(col = ANY($n) OR col IS NULL)`, all on the field's ordinary index.
- **The narrowed set.** Before a narrowed query runs, the server counts its core up to `narrowLimit` (from the counter table when the core filters on the facet alone) and refuses past it. Under match any it sums the count of each filter through that filter's own index, and falls back to the whole table when a filter has none. The query then runs with `enable_seqscan = off`, so it reads the core's index and filters, and the statement budget remains the safety net.
- **Groups.** By the counted field the headers are the counter table: count and every sum. Under another filter they are one capped live count per value, with no sums. By any other field they are one `GROUP BY` over the narrowed rows, largest first, cut at 200 groups, reading a lookup field's label in the same statement. The rows of a group are the ordinary keyset page with that value added, so a collapsed group reads nothing.
- **The migration** is generated from the defs: one `CREATE INDEX CONCURRENTLY` per index, each named `auto_<table>_<columns>` and followed by `COMMENT ON INDEX … IS 'Auto-created.'`, then three counter steps. The comment is written even when `IF NOT EXISTS` skips the build, so a hand-made index must never take an `auto_` name. The first installs the triggers, which keep the counter table current and log each change. The second counts the table from one snapshot, with no table lock. The third replaces the counters with the count plus the changes logged since. A run that stops anywhere leaves the counters following every write, and resumes from the top or from the step that failed.
- **A total added to a def** is a new counter column. The migration is run again, and the new sum is exact once its third step has run.

## Localization

- **The locale is the app's.** `QueryGridMessagesProvider` takes `locale` (default `en`) and `messages`. Every count, sum, money value, date, plural and list a component renders is formatted in that locale (an integer field's own value, such as an order number, is shown as written), so messages and numbers cannot disagree. A def carries no locale.
- **The currency is the data's.** A money field carries its own `currency` (default `USD`), so two money fields of one grid can differ.
- **Every sentence a user reads comes from one messages object**, through `useMessages()`. English is built in, and with no provider a component renders English. An override names only what it changes, and a nested provider keeps the locale and the messages the outer one set and it does not name.
- **Core and the Postgres package emit codes and params, never English.** A refusal reason, a `QueryRejected`, a failed request and an unavailable total are codes; a chip is data. The React package turns each into a sentence.
- **Plurals** go through `Intl.PluralRules` and lists through `Intl.ListFormat`.
- **Right to left works.** The stylesheet uses logical properties only, inline layout uses `insetInlineStart`, column resize and drag follow the direction, and every message, count and formatted value sits inside `<bdi>`.
- **English that stays** is text no user reads: `validateGridDef` problems, `describeIndex` and comments in generated SQL.

## Theming

- **The library follows the host's `--ui-*` tokens.** `styles.css` reads them and defines none, and it hard-codes no colour: tints are `color-mix()` of tokens. Dark mode is the host's tokens taking dark values, so it needs nothing from the packages.
- **`web.css` defaults to the system scheme**, through `light-dark()` and `color-scheme: light dark`. A host picks a theme by setting `color-scheme`, and a host palette uses `light-dark()` pairs the same way.
- **The demo** overrides the system with `data-theme` on `<html>`, set before paint by an inline `<head>` script from local storage. The server never reads the choice, so the static shell stays request-free.

## Scale

- **Nothing grows with a tenant count.** This is library code. Capabilities are computed once per def.
- **Request path.** One interaction is one indexed page read, one capped count and one statement for every total. Each is bounded by the page size, the cap or a time budget.
- **Storage per index.** Every declared index is a real index on its table. Indexes are declared deliberately, per grid, and never generated per column.
- **Write amplification.** Each insert writes every index. Write cost is proportional to the index count.
- **Counters.** A write costs one counter-row upsert per insert or delete, and two per change of the facet field or of a total field. Each extra total adds one counter-column update to that same upsert, not another statement. The counter row is a hot row under concurrent writes to one facet value.
- **Several values per field.** `= ANY` has no single index order to read, so the cost grows with the table. An index whose page misses the budget is declared `multi: false`.
- **The search** is bounded by its time budget, not by the index, and its threshold falls as the table grows.
- **The narrowed set** is bounded by `narrowLimit` rows whatever the table holds. Its cost is the count of the core plus one pass over at most that many rows, on every page, count and total of a narrowed query.
- **Rollout.** Indexes are built `CONCURRENTLY` and never block writes. The counter backfill is one snapshot read of the table with two brief table locks around it.

## Invariants the tests hold

- Core imports no React, UI SDK, `pg` or DOM global and has no dependency.
- The Postgres package imports no React or `pg`, depends on core alone and defines no contract symbol of its own.
- No base component imports a provider hook or holds an English literal.
- A query encoded by core is decoded by the handler into the same SQL parameters.
- Every state reachable through the demo's offers matches a declared index.

## Deferred

- Nested groups, full-text or vector search, and an OR, a second range or a contains above the narrowed-set limit.
- A range beside the search: measured within budget at the median and over it in the tail.
- A separate components npm package.
- Runtime add and remove of filters: a "+ Add filter" menu over the allowed fields, modelled on the columns menu and the column state, with the containers' `fields` as the initial list.
- A migration CLI. The demo has its own generator script.
- Generic status moves on the server beyond the `moves` hook.
- `createGridHandler` in core. Its built-in routes call the Postgres runner directly, so moving it needs an executor interface between the handler and a backend.
- A separate memory adapter package. It is the `./memory` subpath.
- Rows that mix currencies within one field. A money field has one currency.
