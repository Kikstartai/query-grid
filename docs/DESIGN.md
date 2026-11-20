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
- **Every feature is in one of three tiers.** An index answers it at any table size; or it runs over a narrowed set, counted first and refused past `narrowLimit`; or it is not offered, and its control stays visible, disabled, with the reason. A client grid holds its rows and takes everything.
- **Some operations run only over a narrowed set.** An OR across fields, a range no index bounds, a negation (not equals, not between, not contains, none of), a text or array filter with no index of its own, blank on a field no index holds, and a group by a field no counter holds are answered over the rows the indexed filters leave, and only when those rows number at most `narrowLimit`. A control that needs a smaller set stays visible and says how large the set is.

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

- Core also holds what the grid features need and no browser does: `sortRows` over several columns, the CSV encoder (`encodeCsv`, `formatExportValue`, `listExportFields`), the reorder model (`canReorder`, `explainReorder`, `resolveRowMove`, `reorderRows`) and `normalizeStoredGridDef`.
- The stores are plain objects with `subscribe` and a getter, built on one emitter. There is no store library.
- The count, totals and facet counts are one kind of resource: it follows the query store, starts on its first subscriber and aborts the request it replaces.

### `@kikstart/query-grid-react`

| Export         | Holds                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./components` | controlled base components, `QueryGridMessagesProvider`, `useMessages`, `useLocale`, `useCurrency`, the column-state API, `FieldDef` and `GridDef` |
| `.`            | `QueryGridProvider`, `StaticQueryGridProvider` and the hooks                                                                                       |
| `./ui`         | one bound wrapper per base component, under the same name                                                                                          |
| `./styles.css` | the package's own styles                                                                                                                           |

- A base component takes props and calls back. It imports no provider hook and knows no query, source, index or URL. An option or a control may carry `disabled` and a `reason`.
- A bound wrapper reads the provider and renders the base component of the same name.
- Everything is built on UI SDK components and behaviours. There are no hand-written primitives, no native `<select>` or date input and no table library.
- `DataGrid` is a compound: `Root`, `Toolbar`, `Status`, `ColumnsMenu`, `Selection` and `Body`, with `<DataGrid />` as the default composition. It takes a row window: `rows`, `hasNext`, `onEndReached` and `loading`.
- A header's sort button shows the direction and, with several sort columns, the column's place. Click replaces the sort; Shift+click adds the column, turns it, then removes it. A column the data cannot sort by now is a disabled button with its reason; one that never sorts is a label.
- `DataGrid` reports its selection (`onSelectionChange`), and `DataGrid.Selection` is the bar that shows it and holds the host's bulk actions. When every loaded row is selected and more match, the bar offers everything matching: a flag, not ids, kept true while all loaded rows stay selected.
- A row opens through `rowHref` or `onRowOpen`: the first visible column with no `cell` of its own holds the link or button, and Enter on any cell of the row opens it. `rowActions` adds a trailing column of triggers and one UI SDK Menu for the grid, opened through a menu controller with the row as its payload; Shift+F10 on a cell presses that row's trigger. A press on a link or a button inside a cell never starts a cell range.
- `onRowReorder` adds a column of handles. The handles are parts of a second primitive, a rail built on UI SDK's `createReorder`: its draft order is the order the rows render in, so the list reorders under the pointer and the keyboard, and the moving row is kept mounted by the virtualizer.
- A field with no `cell` renders through `FieldCell`: a badge for `render: "badge"`, a list for `render: "list"`, the formatted value otherwise.
- `ExportButton` asks the source for the CSV of the current query and saves it; it is held with its reason when the count is known to be over the export limit.
- `DataGrid` also takes `groups`. Each group is a header row, the rows of an open group and a load-more row, all mixed into the one virtual list. The cell focus, the range and the selection run over the data rows alone, so the arrow keys step from row to row past a header, and a header is a button on its own tab stop.
- Column state (order, width, visibility, pin) is internal by default and can be controlled. It persists through a `ColumnPersistence`; the provider's default is local storage keyed by the def's `id`.
- `StatusBoard` knows lanes, `onMove` and `canMove`. The lane feeds live in core's board model.
- A field's filter is one control, `FieldFilter`: an operator select listing the operators the source could ever answer for the field, then a value editor picked by the operator's shape. A list is `EqualsSelect` (a field with options, or a boolean with its two values) or `LookupFilter` (a lookup), one value a number input, a date picker or a text input, a pair two of them, a preset the period select, and `blank` or `not_blank` nothing. An operator the offers do not hold now is listed, disabled, with its reason; a text operator answered only through a text index asks for three characters. Changing the operator keeps what it can of the value (between 5 and 9 turned greater than is greater than 5). `(blank)` is a choice of `any of` on a nullable field. `CombineToggle` and `GroupControl` are the other two controls.
- The bound `FilterBar` and `FilterSidebar` take `fields`, a list of field keys: the search, the control of each named field in that order, the Match toggle, the sort and the group. Without it they show every field the source can filter. `children` replaces everything.
- A provider takes a `scope`: filters ANDed into every read that are no part of the query, the URL or the chips. It is read once, like the def, and wraps the source with core's `withScope`.
- `QueryGridProvider` keeps the query in the URL through nuqs, which is a peer dependency. `StaticQueryGridProvider` takes a `queryString` and needs no adapter. `urlPrefix` namespaces one grid's keys, for two grids on a page.
- `styles.css` styles only the package's own elements, reads the `--ui-*` tokens of `@ui-sdk/core/web.css` and defines none.

### `@kikstart/query-grid-postgres`

| Part                | Holds                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| storage             | `PostgresGridDef`: the def plus `table` and `facet.counterTable`                                                                              |
| validation          | `validateGridDef`, `validateGridDefs`, `describeIndex`                                                                                        |
| SQL builder         | the page, row, count, total, facet and group statements; `assertDeclared` and `QueryRejected`                                                 |
| runner              | `listGridPage`, `walkGridPages`, `walkExportPages`, `getGridCount`, `listGridTotals`, `listFacetCounts`, `listGridGroups`, `getNarrowedSizes` |
| DDL                 | `generateGridMigration`, `listGridMigrationSteps`, `listTableMigrations`, `listIndexDdl`, `listMissingIndexes`                                |
| `createGridHandler` | a fetch-standard `Request` in, a `Response` out                                                                                               |

## The grid def

A host writes one object per grid and checks it with `satisfies GridDef & PostgresGridDef`.

| Type              | Package  | Adds                                                                     |
| ----------------- | -------- | ------------------------------------------------------------------------ |
| `BaseGridDef`     | core     | `id`, `fields`, `defaultSort`, `facet`, `totals`, `search`, `orderField` |
| `IndexedGridDef`  | core     | `indexes`, `textIndexes`, `arrayIndexes`                                 |
| `GridDef`         | React    | a `cell` on any field                                                    |
| `PostgresGridDef` | Postgres | `table` and `facet.counterTable`                                         |

- A field is `key`, `label`, `type` (`id`, `text`, `enum`, `integer`, `decimal`, `money`, `boolean`, `date`, `datetime`, `array`), `nullable`, `options`, a `lookup` for a large option list, `maxValues`, `currency` on a money field, `grouping: false` on an integer that names a row (an order number) so it drops the thousands separator, and the layout hints `width`, `pinned`, `hidden`, `wrap`, `render` (`text`, `badge`, `list`) and `tones`.
- `orderField` names the number a manual order is kept in. Only a def with one reorders.
- `nullable` is what makes a field optional: only such a field takes `blank` and `not_blank`.
- The React package ignores `table` and `counterTable`. The Postgres package ignores `cell`. The memory source ignores indexes and storage.
- `facet` names one field with options. `totals` lists the money or integer fields the footer sums.
- An index is the unit the data layer answers: a set of equality fields and a sort, optionally with a range on the sort. Each is one `CREATE INDEX`; the search's columns are `search` on the def, with one index of their own.
- An index with `then` declares a composite order: its sort, then those columns, then the key. It answers exactly that order, every column in one direction, and not its first column alone.
- An index's equality fields take several values each unless it sets `multi: false`.
- An index with `blank` is partial: it holds only the rows where those nullable fields are blank, and answers a query that filters them to blank beside its equalities.
- `textIndexes` names text fields with a trigram index each, and `arrayIndexes` array fields with a GIN index each. They answer a filter, never an order, so they are lists beside `indexes` and not indexes in it.
- `normalizeStoredGridDef` turns a def read from storage into one built only from known keys, or a list of problem codes with paths. It accepts the core def and its indexes and refuses `table` and `counterTable`: storage is the host's. It checks shape, not truth: `{ fields }` holds a stored def to the columns a host allows, and the indexes it declares are claims to check against the database with `listMissingIndexes`.
- `validateGridDef` checks a def against Postgres's rules before any migration is written: among them, a total must be a non-null money or integer field named once, and a currency must be a code `Intl` knows.

## Data source capabilities

The capabilities are what a data source can answer fast. Every control reads them; nothing reads the indexes directly.

```ts
interface DataSourceCapabilities {
  holdsAllRows: boolean;
  searchIsOrdered: boolean;
  facetCountsFollowFilters: boolean;
  narrowLimited: boolean;
  combineOr: boolean;
  canRun: (query: QueryState) => boolean;
  isNarrowed: (query: QueryState) => boolean;
  narrowBasis: (query: QueryState) => string;
  filterOps: Record<string, FilterOp[]>;
  groupFields: string[];
  sortFields: string[];
  thenByFields: string[];
  sortOrders: string[][];
  searchFields: string[];
  isFacetCountExact: (query: QueryState) => boolean;
}
```

- `sortFields` are the first sort columns an index gives. `thenByFields` are the columns a further sort may take: on a server grid every field with a value in each row (not nullable, not an array, not the key), on a client grid every field. `sortOrders` are the composite orders the indexes declare.
- `filterOps` is, per field, the operators some tier answers. `indexCapabilities(indexes, { facetField, searchFields, fields, textIndexes, arrayIndexes })` builds them for a server grid: a choice field takes `any_of` (and `none_of`) only when it is in an index's `equals`; every other operator of the field's kind is listed, since the narrowed set answers what no index does. It also lists every index's sort, `searchFields`, and every equality field but a bare id as a group. `createHttpSource(def, basePath)` calls it, so the client offers exactly what the server accepts.
- `memoryCapabilities(def)` builds them for a client grid: every field takes every operator of its kind, and every field sorts.
- A query that costs what it matches, not what the page holds, is budgeted: the search, and a plan whose core holds a filter with an index of its own. `isQueryBudgeted(def, query)` is the one test, and a source runs such a query under its time budget.
- `planQuery(indexes, query, extras)` splits a query into the core an index answers (the equality filters, the sort and a range on it) and the parts that run over that core's rows. Further sort columns stay in the core when an index declares that order, every column one way; otherwise the core keeps the first column alone and the query is narrowed. A core that drops a sort column keeps its range before it keeps the order, and never keeps a text or an array filter: those join the narrowed set, so the size probe stays a plain index scan. A text or array filter whose field has an index of its own stays in the core, and the plan is `budgeted`; beside any narrowed part it joins the narrowed set instead. `isNarrowed` says a query has such a part, or groups by a field other than the counted one. `narrowBasis` names the rows they run over, so a size known for one query answers another over the same rows.
- `canRun` is the answer for one query. `filterOps` is what could ever be asked.
- Flags say how the source behaves, never which kind it is: `holdsAllRows` (every row is in hand, so a board lane keeps the whole query), `searchIsOrdered` (search results sort like any query, rather than arriving as one capped unordered batch the feed sorts itself) and `facetCountsFollowFilters` (facet counts are recounted under the other filters, rather than read from the counter table) are true for the memory source and false for an index-backed one. `narrowLimited` is the reverse: an index-backed source limits the narrowed set and the memory source does not.
- `OfferContext` is the capabilities, whether every search match is loaded, and `narrowed`: the size of the rows the current filters leave, as the source last counted it.
- An action whose result is a narrowed query is offered only when that size is known and within the limit. A query already over a narrowed set may change its filters freely: the server decides, and a refusal shows in the grid with the limit.
- `listOffers(def, query, context)` says what the next action may be. `applyAction` refuses an action whose result the capabilities do not answer. Its `filters` hold, per field and operator, `{ op, offered, reason, minLength? }`, and `multi` the fields whose `any_of` takes several values. `explainUnavailable(def, query, target, context)` gives the reason as a code.
- The URL keys a provider owns are `f.<field>.<op>` for every operator in `filterOps`, and the query's own keys. Any other parameter is left alone.
- `withScope(source, scope)` answers every capability for the scoped query, takes the scope's fields out of `filterOps` and the group fields, and withdraws Match any, which would OR the scope away. On a source that reads facet counts from a counter table it hides them: those count the whole table.

## Query state

```ts
type Filter =
  | { field: string; op: OneOp; value: string }
  | { field: string; op: "between" | "not_between"; min: string; max: string }
  | {
      field: string;
      op: "any_of" | "none_of" | "all_of";
      values: (string | null)[];
    }
  | { field: string; op: "in_period"; preset: DatePreset }
  | { field: string; op: "blank" | "not_blank" };

interface QueryState {
  filters: Filter[];
  combine: "and" | "or";
  search: string | null;
  sort: { field: string; direction: "asc" | "desc" };
  thenBy?: { field: string; direction: "asc" | "desc" }[];
  group: string | null;
  cursor: string | null;
}
```

- **One operator table.** `OPERATORS` in core holds every operator with its value shape (`one`, `pair`, `list`, `preset`, `none`) and the field kinds it applies to. A field's kind follows from its def: an array is `array`; a field with options or a lookup, an enum, a boolean or an id is `choice`; a date or datetime is `date`; a number is `number`; any other field is `text`. `listFieldOps(field)` is the menu's whole contents; `blank` and `not_blank` are on nullable fields only. Filters, the URL, the menus, the controls, the labels (`messages.ops.<kind>.<op>`), the SQL and the planner all key off it.

| Op                 | Text         | Number           | Date         | Choice    | Array   |
| ------------------ | ------------ | ---------------- | ------------ | --------- | ------- |
| `equals`           | equals       | equals           | on           | –         | –       |
| `not_equals`       | not equals   | not equals       | not on       | –         | –       |
| `contains`         | contains     | –                | –            | –         | –       |
| `not_contains`     | not contains | –                | –            | –         | –       |
| `starts_with`      | starts with  | –                | –            | –         | –       |
| `ends_with`        | ends with    | –                | –            | –         | –       |
| `greater_than`     | –            | greater than     | after        | –         | –       |
| `greater_or_equal` | –            | greater or equal | on or after  | –         | –       |
| `less_than`        | –            | less than        | before       | –         | –       |
| `less_or_equal`    | –            | less or equal    | on or before | –         | –       |
| `between`          | –            | between          | between      | –         | –       |
| `not_between`      | –            | not between      | not between  | –         | –       |
| `in_period`        | –            | –                | in period    | –         | –       |
| `any_of`           | –            | –                | –            | any of    | any of  |
| `none_of`          | –            | –                | –            | none of   | none of |
| `all_of`           | –            | –                | –            | –         | all of  |
| `blank`            | blank        | blank            | blank        | blank     | blank   |
| `not_blank`        | not blank    | not blank        | not blank    | not blank | –       |

- Filters combine with AND, or with OR under `combine: "or"` once there are two. A field may carry several. A list takes up to the field's `maxValues` (default 20), and a query up to 20 filters.
- **Blank in a list.** `null` in an `any_of` list is "or blank" ("Glen or nobody"), the one mix an equality index answers.
- **What runs where.** On a server grid each filter is answered by an index (`any_of`, `blank`, `not_blank` and `equals` on a field in an index's `equals`; `blank` also on a partial index's `blank` field beside its equalities; a comparison on the sort field of an index with `range`, the first such one), by an index of its own under the search budget (`contains`, `starts_with`, `ends_with` of three characters or more on a `textIndexes` field; `any_of` and `all_of` on an `arrayIndexes` field), or over the narrowed set (everything else: a negation, a second range or one off the sort, a text or array filter with no index of its own, blank on a field no index holds). `equals` on a number or a date lowers to an equality when an index holds the field, else to a range.
- **A day.** A `date` field compares calendar days. On a `datetime` field a day means the whole of it: "on" is the range of its two ends, "after" is past its last instant and "before" is short of its first.
- **Intent.** `in_period` (`today`, `yesterday`, `last-7-days`, `last-30-days`, `this-month`, `last-month`, `this-year`) is resolved when the query runs to whole days in the viewer's time zone, both ends included. `none_of` on a field with a fixed list of values becomes `any_of` the remaining values (and blank, on a nullable field), so an option added later is included; it is refused when nothing would remain or more than `maxValues` would. Both stay in the URL and the query as written.
- **A wrapper that rewrites queries goes through `mapSourceQueries`**, which names every query-taking member of a data source once. `withLiteralFilters` and `withScope` are both calls to it.
- **Intent becomes literal filters at the source.** `withLiteralFilters` wraps a data source: every fetch sees literal values and bounds, the capability checks (`canRun`, `isNarrowed`, `isFacetCountExact`) see the same rewrite against a fixed day, and `narrowBasis` sees a period by its name. It adds `in_period` and `none_of` to `filterOps` wherever `between` or `any_of` is listed. Both built-in sources are wrapped. The server never sees either and refuses both as `literal_required`.
- **Text** operators ignore case, except `equals` and `not_equals`, which compare the exact text. **Array** `any_of` holds any of the values, `all_of` every one, `none_of` none. **Match any** ORs every filter. **Group** names one field to group the grid by; on a server grid it runs over the narrowed set unless it is the counted field.
- **A negation keeps a blank cell.** `not_equals`, `not_between`, `not_contains` and `none_of` match a row whose field is blank, unless `none_of` lists blank itself.
- **Sort.** `sort` is the first column and `thenBy` up to two more, each with its own direction; the key breaks ties the first column's way. `setSort` replaces the sort, and reaches a declared composite order when its first column has no index of its own; `addSort` adds or turns a column; `removeSort` drops one and falls back to the default sort when what is left does not run.
- The actions on filters are `setFilter` (the at-th filter on its field, or a new one), `removeFilter` (one, or every filter on a field) and `removeFilterValue`.
- The search takes 3 to 80 characters. On a server grid it combines with filters an index answers as equalities, and with nothing else.
- The search is an unranked, case-insensitive substring match (`ILIKE '%term%'`) over the def's `search` columns joined with spaces, backed by a `pg_trgm` GIN index. It is not full-text search: no stemming, no ranking, no order.
- The URL is the source of truth: `f.<field>.<op>=<value>` per filter, repeated per list value (`f.status.any_of=open&f.status.any_of=paid`), `_empty` for blank in a list (the token lives only in the codec), `min..max` for a pair (`f.total.between=500..900`), a preset's name (`f.created_at.in_period=last-7-days`), and an empty value for `blank` and `not_blank` (`f.note.blank=`). Then `match=any` (`combine: "or"`), `group=<field>`, `q`, `sort=<field>.<direction>` with further columns after commas (`sort=item_count.desc,total.desc`) and `view`. Keys of the earlier format are ignored. Core's `encodeQuery` and `decodeQuery` are the only codec, in the browser and on the server.
- A filter, sort, view or reset pushes a history entry. The search replaces. A URL nothing answers is rewritten to the default.
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
| `GET /narrowed`    | `{ limit, and: { rows, over }, or }`: the rows the indexed filters leave, and the sum of the terms under match any         | built in                     |
| `GET /limits`      | the limits the handler runs under                                                                                          | built in                     |
| `GET /export`      | the whole filtered result as `text/csv`, streamed; `columns` names the fields                                              | built in                     |
| `GET /options`     | `[{ value, label }]` for a lookup field                                                                                    | the `options` hook           |
| `GET /transitions` | `[[from, to]]`, for the board                                                                                              | the `moves.transitions` hook |
| `POST /status`     | `{ id, to }` moves one row and returns it                                                                                  | the `moves.change` hook      |
| `POST /order`      | `{ id, after, before }` moves one row in a manual order and returns the rows whose order value changed                     | the `reorder.move` hook      |

- The query travels as the same URL parameters the page uses.
- An error body is `{ error, message, code, params }`. `error` is the category, `code` the specific reason, `message` the code and its params for logs.
- A refusal is a 400, a refused transition a 409, an unknown route or an omitted hook a 404, a wrong method a 405, an aborted request a 499 and anything else a 500.
- Every response is `no-store` and carries `server-timing`.
- `limit` defaults to 200 and is capped at 1,000. A count is capped at 10,000 and a search result at 500 rows. These, the search budget and the narrowed-set limit are `GridLimits`, set once on the handler (`limits`) or passed to a runner function. The browser holds no copy: a response carries the limit that shaped it, and `/limits` answers them all.
- A refusal over the narrowed-set limit is `narrow_first` with `rows` and `limit`.
- An export over `exportLimit` (or, for a search, `searchLimit`) is `export_too_large` with `limit`. It is decided before the response starts, so it is a 400 with a body like any refusal. A failure after the first byte can only end the stream.
- The cursor is the sort values of the last row, one per sort column, and its key. A cursor of another length, or with a value outside its column's type, is `invalid_cursor`.
- `/order` validates `id`, `after` and `before` as keys, and needs one neighbour that is not the row itself, before the hook runs. A `POST` body is read only as `application/json`.
- A value is checked to what Postgres takes before any SQL exists: an instant is an ISO date with an optional time and zone, a day is a real day, and text carries no NUL byte. A cursor is checked the same way, a little wider: it holds what the server printed, so a decimal may carry an exponent and a text value may be empty.
- `/facets` ignores the query: facet counts are whole-table counts.
- A total is unavailable per field, as `over_cap` with the cap.
- Every read runs under `request.signal`, which is the third argument of the host's `execute` and of the hooks.
- The demo's executor starts each statement with a per-call marker, `/* qg:<uuid> */`, and cancels an aborted one through `pg_stat_activity` by that marker, from a one-connection pool of its own, and retries while the statement has not started. It never names a backend pid, so the cancel is correct behind any transaction pooler. Its 5 s statement budget is a `SET LOCAL` inside each statement's transaction, so a pooler that drops startup parameters still applies it.
- The server refuses before any SQL exists: `assertDeclared` rejects an operator outside the field's kind (`invalid_op`), an operator only the browser resolves (`literal_required`), more than 20 filters (`too_many_filters`), a query no tier answers (`unindexed_query`), an unknown field, a value outside its type, more values than a field's cap, and an undecodable cursor.

## Storage

- **One declared index, one `CREATE INDEX`.** An ordered index is a btree over its equality columns, its sort and the key, with `WHERE <field> IS NULL` for each field in its `blank`. The def's `search` is one trigram index over the concatenated columns. Each field in `textIndexes` is a trigram GIN index on that column, and each in `arrayIndexes` a GIN index on the array.
- **Paging is keyset**, on the sort and the key, in both directions. With further sort columns the key is every sort column and then the row key. Columns that all run one way compare as one row, `(a, b, id) < ($1, $2, $3)`, which a composite index reads as one range. Mixed directions are spelled out column by column behind a bound on the first, `a <= $1 AND (a < $1 OR (a = $1 AND (b > $2 OR …)))`, and run only over a narrowed set.
- **A composite order** is one btree over the equality columns, the sort, the `then` columns and the key. A live total of a query it answers is read in that same order, so the scan still stops at the cap.
- **An export** is the capped count of the query up to `exportLimit`, then the keyset walk in pages of 1,000, each page encoded and sent as it is read. The narrowed set is sized once for the walk. CSV cells are plain values. Every text cell is quoted, and one that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is led by an apostrophe. `exportLimit: 0` turns the route off.
- **One value is `= $n`; several are `= ANY($n)`** with one array parameter. SQL is never built from a value.
- **The counter table** holds one row per facet value: `row_count` and one `<field>_sum` column per total field. Three row triggers keep it current, on insert, delete and update of the facet field or of a total field.
- **Counts.** A query that filters on the facet alone reads the counter table. Any other is counted up to the cap, and the exact count is a separate request.
- **Totals.** A query that filters on the facet alone reads the counter table. Any other is summed live in one statement for every total field, over the index scan, and only when at most 10,000 rows match. With one plain value per field the scan is read in sort order, with `enable_sort = off`, so it stops at row 10,001. Several values, not blank and match any are capped unordered instead, like the count: no index gives them an order, and an ordered walk would not stop when few rows match.
- **Match any** reads its rows first, behind `OFFSET 0`, and sorts them after, for the same reason.
- **A filter with an index of its own** (a `contains`, `starts_with` or `ends_with` of three characters or more on a `textIndexes` field, an `any_of` (`&&`) or `all_of` (`@>`) on an `arrayIndexes` field) keeps the page's order and keyset: the statement is the ordinary page with one more clause, run with `enable_seqscan = off` under the search budget, and the planner walks the sort index or reads the GIN index by what the value matches. Its count and total are capped unordered, and all three answer `too_broad` past the budget.
- **One clause per operator.** `equals` is `=` (a day on a datetime its two ends), an open bound `>` or `<`, `not_between` its two outer sides ORed and `not_equals` `<>` (with `IS NULL` on a nullable field), `not_contains` `NOT ILIKE` (with `IS NULL`), text `not_equals` `IS DISTINCT FROM`, `none_of` `<> ALL($n)` (with `IS NULL` unless blank is listed), array `any_of` `&&`, `all_of` `@>` and `none_of` `NOT (col && $n)`, each with one array parameter.
- **The search** runs under a 120 ms statement budget and answers `too_broad` past it. An equality filter beside it is one more clause on the same statement: the planner reads the trigram index, the filter's index or both. No extra index is built for the combination.
- **Blank.** `blank` is `IS NULL` (on an array, also an empty one), `not_blank` `IS NOT NULL`, and blank in an `any_of` list `(col = ANY($n) OR col IS NULL)`, all on the field's ordinary index when it has one.
- **The narrowed set.** Before a narrowed query runs, the server counts its core up to `narrowLimit` (from the counter table when the core filters on the facet alone) and refuses past it. Under match any it sums the count of each filter through that filter's own index, and falls back to the whole table when a filter has none. The query then runs with `enable_seqscan = off`, so it reads the core's index and filters, and the statement budget remains the safety net.
- **Groups.** By the counted field the headers are the counter table: count and every sum. Under another filter they are one capped live count per value, with no sums. By any other field they are one `GROUP BY` over the narrowed rows, largest first, cut at 200 groups, reading a lookup field's label in the same statement. The rows of a group are the ordinary keyset page with that value added, so a collapsed group reads nothing.
- **The migration** is generated from the defs: one `CREATE INDEX CONCURRENTLY` per index, each named `auto_<table>_<columns>` and followed by `COMMENT ON INDEX … IS 'Auto-created.'`, then three counter steps. The comment is written even when `IF NOT EXISTS` skips the build, so a hand-made index must never take an `auto_` name. The first installs the triggers, which keep the counter table current and log each change. The second counts the table from one snapshot, with no table lock. The third replaces the counters with the count plus the changes logged since. A run that stops anywhere leaves the counters following every write, and resumes from the top or from the step that failed.
- **A total added to a def** is a new counter column. The migration is run again, and the new sum is exact once its third step has run.

## Localization

- **The locale is the app's.** `QueryGridMessagesProvider` takes `locale` (default `en`) and `messages`. Every count, sum, money value, date, plural and list a component renders is formatted in that locale (an integer field's own value, such as an order number, is shown as written), so messages and numbers cannot disagree. A def carries no locale.
- **The currency is the host's, never the locale's.** `QueryGridMessagesProvider` takes `currency` beside `locale`, nested providers inherit it, and core's `formatValue`, `formatSum` and `formatMoney` take it as an argument after the locale. A money field resolves `field.currency ?? currency`; with neither, it formats as a plain number with two fraction digits and no symbol.
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
- **A composite order** costs one more index, like any declared index, and nothing on the request path: a page is one range read of it.
- **An export** costs one capped count and one page read per 1,000 rows, at most `exportLimit` rows. It holds one request open for as long as that takes; the limit is the host's latency and memory choice.
- **Selection** costs no request: everything matching is the query the page already ran, with the count it already has.
- **Reorder** runs only over a set held whole, at most one page of rows, so the client's work is bounded and the server's is the host's hook.
- **The narrowed set** is bounded by `narrowLimit` rows whatever the table holds. Its cost is the count of the core plus one pass over at most that many rows, on every page, count and total of a narrowed query.
- **Rollout.** Indexes are built `CONCURRENTLY` and never block writes. The counter backfill is one snapshot read of the table with two brief table locks around it.

## Invariants the tests hold

- Core imports no React, UI SDK, `pg` or DOM global and has no dependency.
- The Postgres package imports no React or `pg`, depends on core alone and defines no contract symbol of its own.
- No base component imports a provider hook or holds an English literal.
- A query encoded by core is decoded by the handler into the same SQL parameters.
- Every state reachable through the demo's offers matches a declared index.

## Deferred

- **Out of the grid features, deliberately:** page-number pagination (keyset scrolling stays: an offset is a cost that grows with the page); Excel and PDF export (core has no dependencies; `walkExportPages` and the CSV pieces are what a host's own encoder plugs into); an export shaped for re-import; edit and delete dialogs and form modals (`onRowOpen`, `rowActions` and `onRowAction` are the seam); permissions (a host shows and wires only the actions a user may take, and the handler's hooks are where it enforces them); translations beyond the one English messages object; and settings toggles, which stay layout props on the parts.
- A composite order with mixed directions at any size: it needs a `DESC` column in the index and a keyset written as a union of ranges. It runs over the narrowed set today.
- A first sort column with no index, a nullable sort column on a server grid, a default sort of several columns, and a text sort value longer than 2,000 characters, which a cursor refuses.
- Reorder on a server result larger than one loaded page, and reorder inside a group.
- An export of the selected ids alone, an export of a grouped view as groups, and an export above `exportLimit` as a background job.
- A row actions menu on right click, and select-everything-matching in a grouped grid.
- Nested groups, full-text or vector search, and an OR, a second range or a negated filter above the narrowed-set limit.
- A text filter with an index beside a narrowed part, above the narrowed-set limit: it joins the narrowed set today.
- Facet counts under a scope on a server grid, an add-a-range control (a second range on a field comes from the URL or `addRange`), and a scope the handler enforces from the request.
- Case-insensitive equality, which needs an expression index on the lowered column.
- A range beside the search: measured within budget at the median and over it in the tail.
- A separate components npm package.
- Runtime add and remove of filters: a "+ Add filter" menu over the allowed fields, modelled on the columns menu and the column state, with the containers' `fields` as the initial list.
- A migration CLI. The demo has its own generator script.
- Generic status moves on the server beyond the `moves` hook.
- `createGridHandler` in core. Its built-in routes call the Postgres runner directly, so moving it needs an executor interface between the handler and a backend.
- A separate memory adapter package. It is the `./memory` subpath.
- Rows that mix currencies within one field. A money field has one currency.
