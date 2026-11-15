# query-grid restructure: spec (2026-11-14, rev 2: three packages)

Glen settled every decision here. This spec combines the design note (`query-grid-restructure-design.md`), the independent review against the code (`query-grid-restructure-review.md`, which holds the `path:line` evidence) and Glen's answers. Rev 2 replaces the two-package split with three packages and drops the duplicated contract. Paths are relative to today's `packages/query-grid/src` unless they start with `apps/`.

## Model

A React-free core holds the query model. A React package on UI SDK holds controlled base components, plus the constrained grid bound to the core. A Postgres package holds the server. Every base component works without the constraint, the query layer and any provider.

## Packages: three npm packages in one repo, released together at 0.2.0

Nothing is published yet, so the names change freely.

| Package                         | Depends on                        | Role                    |
| ------------------------------- | --------------------------------- | ----------------------- |
| `@kikstart/query-grid`          | nothing (no React, no pg, no DOM) | core                    |
| `@kikstart/query-grid-react`    | core, React, UI SDK               | components + bound grid |
| `@kikstart/query-grid-postgres` | core (no React, no pg)            | server                  |

There is **one query contract**, in core. `-react` and `-postgres` both import it, and nothing is duplicated.

### `@kikstart/query-grid` (core)

| Export     | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.`        | The query contract: QueryState, the React-free field types, `KEY_FIELD`, `QUICK_MIN_LENGTH`/`QUICK_MAX_LENGTH`, `PAGE_LIMIT_MAX`, `COUNT_CAP`, `QUICK_LIMIT`, `formatCount`. Also validation (`validateQueryValues`), the URL `encodeQuery`/`decodeQuery`, the query state and emitter-based stores (`model/emitter.ts`), actions and offers (`applyAction`, `listOffers`, `explainUnavailable`), refusal reason codes, feeds (`react/feed.ts` split into rows and summaries), the `DataSource` contract, the `Capabilities` type, and message codes and params. It holds no transport. |
| `./http`   | `createHttpSource` (today's HTTP client in `model/data-source.ts:63–100`), plus the wire types, route paths and error body shared with `createGridHandler`.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `./memory` | The in-memory source (today's `model/memory-source.ts`), including memory-mode capabilities derived from field operators plus a `quick` field list (`model/shapes.ts:78–92`).                                                                                                                                                                                                                                                                                                                                                                                                           |

### `@kikstart/query-grid-react`

| Export         | Holds                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./components` | Controlled base components: DataGrid, FilterBar, SortControl, QuickFilter, FieldFilter, FilterChips, FilterSidebar, FacetPanel, CardList, StatusBoard, ViewSwitch, ColumnsMenu, CountDisplay, TotalFooter, plus `QueryGridMessagesProvider` and `useMessages`. Props in, callbacks out. Each option may carry `disabled` and `reason`. No query, adapter, index or URL concepts. |
| `.`            | `QueryGridProvider`, its hooks (`react/use-store-value.ts` and the rest), `useOfferState`, and the client field type, which extends core's field type with `cell` (ReactNode).                                                                                                                                                                                                   |
| `./ui`         | Thin bound wrappers, one per base component, with **the same names as the base components** (`DataGrid`, `FilterBar`, …). They read the provider and render the base component.                                                                                                                                                                                                  |
| `./styles.css` | The package stylesheet, which replaces `./ui/styles.css`. Consumers import `@ui-sdk/core/web.css` first.                                                                                                                                                                                                                                                                         |

- **Base DataGrid contract:** `rows`, `hasNext`, `onEndReached`, `loading`, plus column state.
- **Column state** (order, width, visibility, pin) is internal by default, with an optional controlled mode (`columns` + `onColumnsChange`). Persistence goes through the existing `ColumnPersistence` abstraction (`model/column-state.ts`). It lives in `-react`, because only the grid uses it.
- **StatusBoard** is generic: `lanes`, `onMove(id, to)`, `canMove(from, to)`. Its per-lane feeds and query stores (`ui/status-board.tsx:359–360`) move into the bound wrapper.
- **Hook calls:** all 67 provider hook calls across 10 ui files move into the bound wrappers, including the direct `useStoreValue` calls in status-board (`:569`, `:643`) and `useOfferState`.
- **No `@tanstack/query-core`.**

### `@kikstart/query-grid-postgres`

- **Imports core** for the contract, validation, `decodeQuery`, `formatCount`, the shape types and helpers, the wire types (core's root) and the route paths (`@kikstart/query-grid/http`). It holds no copy of any of them.
- **Storage:** storage config (table, shapes, counterTable), `validateGridDef`, `describeShape`, refusal (`assertDeclared`, `QueryRejected` with code + params), the SQL builder, the runner, the keyset cursor and the migration/index generator. Since 0.3.0 the shape types and the pure shape helpers (`matchShape`, `shapeId`, `listOrderedShapes`, …) live in core.
- **Capabilities:** since 0.3.0 core's `shapeCapabilities(shapes)` builds them; `-postgres` has no `capabilities` export and no `./capabilities` subpath.
- **`createGridHandler({ def, execute, options?, moves? })`** turns a fetch-standard Request into a Response. It implements the server half of the `/http` protocol:
  - **Routes:** `GET {base}?…&limit`, `/count[?exact=1]`, `/total`, `/facets`, `/options`, `/transitions` and `POST /status`.
  - **Built in:** page, count, total, facets.
  - **Status codes:** a refusal is a 400, a refused transition a 409, and any other error a 500.
  - **Headers:** `no-store` and `server-timing`.
  - **Host hooks:** `options` and `moves` (`{ transitions, change(id, to) }`). An omitted hook answers 404.
  - **Rules:**
    - It parses and validates `limit`: a non-numeric value is a 400, never `LIMIT NaN` (`server/sql-builder.ts:183`).
    - It keeps the `{ error, message }` body, adding `code` and `params`.
    - `/facets` keeps ignoring the query, because facet counts are whole-table counts from the counter table.
  - **Demo:** the demo's 7 route files and `respond()` (`apps/demo/src/lib/api-response.ts`) collapse into one catch-all route.
- **Removed from the old root export:** the old `@kikstart/query-grid` root's storage types and functions, and its `./server` export.

### The GridDef, corrected

- **Persistence key:** the client GridDef gets an explicit `id`, which replaces `def.table` in the column persistence key (`react/query-grid-provider.tsx:112`).
- **What the client def drops:** the client def carries no `table`, `shapes` or `counterTable`. What the client needs from shapes arrives as **capabilities**.
- **One field description type** (Q2) drives the grid and the filters: key, label, type, operators (dropped in 0.3.0), options, lookup, width, pinned, hidden, wrap, nullable. The React-free type lives in core, and `-react` extends it with `cell`.
  - The host declared its fields once, in a React-free module. Since 0.3.0 the rule is one def per grid, and each package reads its slice (see the 0.3.0 section).
  - The server def is those fields plus storage.
  - The client def is those fields plus cells.

### Capability contract

In core, it covers every use the review found:

- the provider URL guard (`react/query-grid-provider.tsx:95`)
- `model/query-actions.ts:121`, `:133` and `:153`
- `ui/status-board.tsx:423` and `:769`
- `ui/filter-bar.tsx:48`
- `ui/facet-panel.tsx:83`
- the `listQuickFields` callers

```
interface Capabilities {
  mode: "server" | "memory";
  isAnswerable(query): boolean;
  sortFields: string[];
  quickFields: string[];
  isFacetCountShown(query): boolean;
}
```

- **What stays out:** `quickComplete` stays in the store (`model/query-store.ts:55`). Reason codes are derived by the constrained layer, not carried in capabilities. `explainUnavailable` uses only the query, the target and the rules.

## Multi-value equality (IN)

Filters stay AND-combined, and there is still no cross-field OR. Within one field, equality accepts several values.

- **Query state:** `equals` becomes `Record<string, string[]>`, holding one or more values per field. The URL codec, validation, offers, chips and capabilities all follow.
- **SQL:** `field = ANY($n)` with one array parameter. It is never built from string concatenation.
- **Value cap:** each eq field has a cap, `maxValues` (default 20), validated in core and refused by `-postgres` (code + params).
- **Shapes:** a shape's equality fields accept multiple values unless the shape sets `multi: false`. The benchmark adds multi-value cases for every ordered shape (2, 5 and `maxValues` values, sorted page and capped count). A shape that misses the page budget with multiple values is declared `multi: false`, and capabilities then offer single-value only for it.
- **Counts and totals:**
  - The capped count works unchanged.
  - Facet counts from the counter table: a facet selected with several values shows the sum of their counts.
  - The total comes from the counter table only when the counter's grouping matches; otherwise it is live under the cap, as today.
- **Controls:** a multi-select on UI SDK (Select or Combobox in multiple mode; read its docs) for eq fields with `options` or `lookup`. Chips are one per field, listing its values, with one remove per value.
- **Memory adapter:** it supports multiple values.
- **Tests:** the URL round trip with multiple values; the SQL builder's `ANY` and the cap refusal; the reachable-states test including multiple values; a DB test on Neon; and the benchmark cases above, 72 of 72 single-value plus the new multi-value cases.

## Localization (required)

- **One `QueryGridMessagesProvider`** in `-react`, with English defaults built in. Base components and bound wrappers both read it through `useMessages()`, which merges the provider's messages over the defaults. With no provider, a component renders English. The query provider has no `messages` prop. Only English ships.
- **Core emits codes and params, never English.** `-react` renders them through messages. This covers:
  - refusal reasons (`model/query-actions.ts:197–216`, `QUICK_UNORDERED_REASON` at `:35–36`, `describeQuery` at `:176–189`)
  - `TotalUnavailable.reason` (`server/query-runner.ts:161`, `:182`; `model/memory-source.ts:196`)
  - `QueryRejected`
  - `listFilterChips`
  - `formatRows`/`formatLoaded` (`model/format.ts:47`, `:55`)
- **Wire:** `-postgres` sends codes and params on the wire.
- **Plurals:** `Intl.PluralRules`.
- **UI strings:** every visible string and aria-label in `-react` comes from messages, including `ui/count-display.tsx:62`, `:89` and `:112–113`.
- **Locale:** it keeps flowing through `def.format.locale`.
- **RTL works:**
  - logical properties in `styles.css` (`:326`, `:403`, `:476`, `:496`)
  - `insetInlineStart` in place of inline `left` (data-grid, grid-header, card-list, status-board)
  - direction-aware column resize (`ui/grid-header.tsx:240`) and drag (`:338`)
  - FilterSidebar `side: "start" | "end"`
  - checked on the demo with `dir="rtl"`

## Tests that must exist after the split

- **Core stays React-free:** core has no React, DOM or pg import, which a grep and its `package.json` confirm. `-postgres` has no React or pg import.
- **Round trip:** `encodeQuery` → `decodeQuery` across `-react`'s use and `-postgres`'s use, both on core's one codec.
- **Reachable states:** the demo's reachable-states × `matchShape` invariant test (`apps/demo/src/core/orders/orders-grid-def.test.ts`) stays, pointed at `shapeCapabilities(shapes)`.
- **SQL builder:** `server/sql-builder.test.ts` gets its own fixtures in `-postgres`. `model/query-model.test.ts` splits into a shape part (`-postgres`) and an action part (core).
- **Carried over:** every existing unit, DB and benchmark test is carried over.

## Release

- **Versions:** all three packages go to 0.2.0 together. It's a breaking change.
- **Docs and demo:** the demo and the README migrate in the same release: Quick start, "Using the hooks alone", "The in-memory data source", "Design as built", "Releasing" and the exports.
- **Build:** each package has its own README, LICENSE and build and prepack scripts (`scripts/build.ts`, `copy-docs.ts`).
- **Publishing:** prepare it only; Glen publishes all three packages.

## Deferred

- a separate components npm package
- runtime add and remove of filters (a "+ Add filter" menu over the allowed fields): model it on `ColumnsMenu` and the column state, with the bound containers' `fields` as the initial list and the user's list kept through the same persistence
- a migration CLI (the demo keeps `db/generate-migration.ts`)
- generic status moves on the server beyond the `moves` hook
- `createGridHandler` in core: its page, count, total and facet routes call the Postgres runner directly, so moving it needs an executor interface between the handler and a backend
- a separate memory adapter package (it is the `./memory` subpath)
- several totals per grid: `GridDef.total` is one field today, and a host may need to sum more than one (a `total_sum` counter column, a footer cell and a `/total` result per field)
- format split by owner: the locale is the app's and the currency is the data's, yet both sit on `GridDef.format` today. The provider reads its locale from `def.format`, not from `QueryGridMessagesProvider`, so messages and number formatting can disagree, and two money fields cannot carry different currencies. Proposed: the locale comes from the messages provider, `currency` moves onto the money `FieldDef` (or the row), and `GridDef.format` becomes an optional override or goes away

## Scale

This is library code with nothing that grows with a tenant count. Each request is one query against a declared shape's index. The benchmark proves 72 of 72 shapes on 620k rows. Capabilities are computed once per def.

## URL history with nuqs (added later, Glen)

- `-react` only: `QueryGridProvider` uses **nuqs** for the URL; nuqs stays internal to the provider and hosts mount a nuqs adapter (Next for the demo, plain React otherwise). Core and `-postgres` gain no nuqs dependency.
- Discrete changes (filter, sort, view, reset) push a history entry; quick-filter typing replaces with throttling. Back/Forward and Next `<Link>` changes flow back into the grid.
- The URL is the source of truth: `dispatch` still runs `applyAction` + the answerable check, then writes through nuqs; the query store follows. Core's query store gains a framework-free way to take a query from outside (e.g. `replace(query)`, validated, falling back to the default).
- The nuqs parsers are built at runtime from the GridDef on top of core's `encodeQuery`/`decodeQuery`, so browser and server read one URL format (`f.<field>`, `r.<field>=min..max`, `q`, `sort`, `view`). Verify nuqs supports the dynamic keys.
- Column layout stays out of the URL.
- The store subscription, the echo guard and the follow step are one plain object, `createUrlSync(store, search, write)` in `react/url-sync.ts`, tested without React; the provider only hands it the nuqs setter. The provider without nuqs uses the same object with a writer that does nothing.

## As built: calls the spec left open

### Names and types

- Core's field type is `FieldDef`; `-react` adds `ClientFieldDef` (with `cell`) and `ClientGridDef`. Core's `GridDef` is generic over its field type, so one def shape serves both. Since 0.3.0 these are `BaseFieldDef` and `BaseGridDef` in core and `FieldDef` and `GridDef` in `-react`.
- The server def is `ServerGridDef extends GridDef`: it adds `table`, `shapes` and `facet.counterTable`, and keeps `id`. Since 0.3.0 it is `PostgresGridDef`.
- `QueryMode` is `"server" | "memory"`; the old `"indexed"` is gone.
- `QueryRules` is `{ capabilities, quickComplete }`. `applyAction`, `listOffers`, `listControlActions` and `enumerateReachableStates` take it as a required argument; `explainUnavailable(query, target, rules)` no longer takes a def.
- `DataSource.mode` is replaced by `DataSource.capabilities`. Since 0.3.0 the provider always takes a `source`; the host calls `createHttpSource(def, basePath)` for the HTTP one, so no provider can be mounted without a source.

### Capabilities

- `shapeCapabilities(shapes, { facetField })` takes the facet field as an option, because `isFacetCountShown` needs it and shapes do not name it.
- Since 0.3.0 it is exported from core's root. Core is browser-safe, so the `-postgres` `./capabilities` subpath, whose only reason was to keep the SQL builder out of a browser bundle, is gone.
- `memoryCapabilities(def, quickFields)` is exported from `@kikstart/query-grid/memory`; `createMemorySource` takes the quick fields as `options.quick`.

### Wire

- The result types live in core's root, because `DataSource` names them. Since 0.3.0 `./http` no longer re-exports them: it holds `createHttpSource` and the protocol (`SUB_ROUTES`, `LIMIT_PARAM`, `EXACT_PARAM`, `ErrorBody`, `MoveBody`, `SubRoute`).
- An error body is `{ error, message, code, params }`. `error` is the category it always was (`undeclared_shape`, `invalid_value`, `invalid_cursor`, `invalid_limit`, `too_broad`, `transition_refused`, `not_found`, `method_not_allowed`, `internal`). `code` is the specific reason (`unknown_field`, `too_many_values`, `quick_length`, a host's own). `message` is the code followed by its params as `key=value`, for logs.
- `TotalUnavailable` is `{ available: false, code, params }` with `no_total` or `over_cap` and the cap.
- `formatCount` stays in core; `-postgres` does not call it, because the cap now travels as a number in `params` and the client formats it.
- The client throws `SourceError` (`code`, `params`); a failed request with no body is `request_failed`.

### createGridHandler

- `basePath` is optional. With it, routing is exact and an unknown path is a 404. Without it, the last path segment picks the route.
- A wrong method is a 405. `onError` receives anything that becomes a 500; it defaults to `console.error`.
- `limit` must be one to nine digits and at least 1, or it is a 400 `invalid_limit`. A missing `limit` is 200 rows; a large one is capped at 1,000.
- `POST /status` validates `id` against the key field and `to` against the facet field before the hook runs.

### Several values per field

- Actions: `setEquals { field, values }`, `removeEqualsValue { field, value }`, `clearEquals`. An empty list clears the field; duplicates are dropped.
- The URL repeats the parameter per value.
- `Offers.multi` lists the fields that take a second value now.
- One value keeps `= $n`, so the single-value plans are unchanged; two or more use `= ANY($n::type[])`. `SqlQuery.values` is `(string | string[])[]`.
- The cap is enforced in `validateQueryValues`, in `applyAction`, and by the server.
- The board shows one lane per selected facet value.

### Components

- The base `DataGrid` takes a row window (`rows`, `hasNext`, `onEndReached`, `loading`, optional `error`, `pages`, `capped`), `resetKey` to clear the selection and scroll to the top, a header `filters` map of field key to node, and `sort` with `onSortChange`.
- `StatusBoard.onMove` is `(id, to, { from, index })`. A rejected promise puts the card back.
- `FilterBar` and `FilterSidebar` are containers that take children. The bound ones fill them with every control by default and, since 0.3.0, take `children` to render a subset.
- Column state is `createColumnStore` in `components/column-state.ts`: the base grid holds one in a hook when it is uncontrolled, and the provider holds one for the bound grid and the columns menu.
- `useFilterChips()` returns each chip as data plus its labelled item.

### Messages and direction

- `QueryGridMessages` is one flat object with four nested maps (`countSources`, `facetNotes`, `reasons`, `reasonParts`) and `errors` keyed by code with `errorFallback`. Numbers in a problem's params are formatted by locale before a message sees them.
- Text is isolated with `<bdi>`, so English inside a right-to-left page keeps its order.
- The `/rtl` route sets `dir` on the workspace element. UI SDK renders popups in place, so they inherit it.
- English that stays, because no user reads it and it never crosses the wire: `validateGridDef` problems, `describeShape`, comments in generated SQL, thrown programming errors, and the UI SDK `keys` note in the grid primitive.

### Tests

- Base components are mounted with `renderToStaticMarkup`, with no provider.
- Three `purity.test.ts` files replace the hand-run greps: core imports no React, UI SDK, `pg` or DOM global and has no dependency; `-postgres` imports no React or `pg`, depends on core alone and defines no contract symbol; no base component imports a provider hook or holds an English literal.
- Core's action tests use a hand-written `Capabilities`. The offers that depend on shapes are tested in `-postgres`, over core's actions and `capabilities(shapes)`.
- The codec test encodes with core, sends the request through `createGridHandler` and reads the SQL parameters; a second test drives `createHttpSource` against the handler.

### Demo

- `orders-fields.ts` is the shared React-free module; `orders-server-def.ts` and `orders-grid-def.tsx` build on it. The client def adds a status badge cell. Since 0.3.0 the orders grid is one file and one object, `ORDERS_GRID_DEF` in `orders-grid-def.tsx`.
- New routes: `/rtl` and `/components`.
- `apps/demo/browser/verify.sh` and `shots.sh` are the scripted pass and the screenshots.

## Added after rev 2, at Glen's word: as built

### URL history with nuqs

- nuqs is a peer dependency of `-react` (`>=2.10.0`, the version checked for `parseAsNativeArrayOf`), because the host's adapter and the provider must share one copy. Core and `-postgres` have none.
- nuqs supports the dynamic keys: the parser map is a plain object built once per def from core's new `listQueryKeys(def)`. An `f.<field>` key is `parseAsNativeArrayOf(parseAsString)`, so several values repeat the parameter; the rest are `parseAsString`.
- The values nuqs reports are turned back into a search string and decoded with core's `decodeQuery`; a state is written by encoding it with core's `encodeQuery` and splitting it by key. No second codec exists.
- Core's store gained `replace(query, view?)`, `normalizeQuery(def, capabilities, query)` and `getHistoryWrite()`. `replace` and store creation both normalize: a query nothing answers, or with an invalid value, becomes the default.
- `dispatch` applies the action in the store at once and the provider writes the result through nuqs; when nuqs reports anything else, the store follows it. A report that only echoes one of the provider's own writes from the last second is skipped, so two quick changes do not bounce the store back to the first.
- A filter, range, sort, view or reset pushes. `setQuick` and `clearQuick` replace, throttled to 250 ms. The quick filter still applies on Enter, so "typing" is each applied term; live search per keystroke was not built, because each term is a trigram query under a 120 ms budget.
- A URL nothing answers is rewritten in place to the default; a parameter the def does not own is left alone.
- Since 0.3.0 the provider without nuqs is its own export, `StaticQueryGridProvider`: it calls no nuqs hook and needs no adapter, takes a required `search`, starts from it and follows it. `QueryGridProvider` has no `search` or `syncUrl` prop.
- `urlPrefix` namespaces a provider's URL keys (`a.f.status`), for two grids on one page. The prefix exists only in the page URL: the store, the sync and the wire to the server keep core's keys.
- The demo mounts `NuqsAdapter` from `nuqs/adapters/next/app` in the root layout. Its pages no longer pass `searchParams`; an `AtRequest` server component awaits `connection()` inside the Suspense boundary, so a deep link is still server-rendered with its state. Since 0.3.0 that boundary wraps the grid parts only, not the page.
- Column layout stays out of the URL.
- The store subscription, the echo guard and the follow step are one plain object, `createUrlSync(store, search, write)` in `react/url-sync.ts`, tested without React; the provider only hands it the nuqs setter. The provider without nuqs uses the same object with a writer that does nothing.

### Migration generator at scale (design note, question 9)

- Indexes are `CREATE INDEX CONCURRENTLY IF NOT EXISTS`, one statement each, outside any transaction. `{ concurrently: false }` opts out.
- The counter backfill is three transactions: install the triggers so they write to the counter table and also log each change; count the table from one `REPEATABLE READ` snapshot into the pending table and delete the logged changes that snapshot can see; replace the counters with the count plus the rest of the log and switch to direct mode. `SHARE ROW EXCLUSIVE` is held for the trigger swap and the replacement only.
- It is a snapshot backfill, not a batched one. Batches cannot be exact without a watermark that every write reads for the life of the table.
- `shortenIdentifier` keeps a name within 63 characters with an FNV-1a hash suffix. It covers index names and the counter's function, trigger and pending-table names.
- `listTableMigrations(defs)` gives one migration per table and writes a shared index once; `validateGridDefs(defs)` validates them together, including an index or a counter table declared with two definitions; `listGridMigrationSteps(def)` gives the steps to send one at a time.
- The counters stay current during the three steps, so a run interrupted anywhere leaves them following every write. The steps resume from the top or from the one that failed: the second and third do nothing once the pending table is gone, and the third raises unless the second has marked the pending table as counted (a table comment). The pending table left by an interrupted run is the only trace, and the demo's DB test reports it until the steps are run again.
- `PgIndexRow.valid` lets `listMissingIndexes` treat an invalid index as missing.
- The demo writes `db/migrations/0002_query_grid_<table>.sql` and applies the steps one at a time.
- The index count stays the cost of principle 1; the README says so under "Cost at scale".

### Stores (Glen's decision)

- No store library. `createEmitter` stays the one primitive; `createStore<T>(initial)` (`get`, `set`, `subscribe`) sits on it and is under every store in core and the column store in `-react`.
- `createQueryResource(queryStore, fetch, options)` is the count, the total and the facet counts: it follows the query store, starts on the first subscriber, aborts the request it replaces, and `refine` re-fetches while keeping the result (the exact count). The row feed keeps its own logic.
- The label store follows the query store itself: it asks the source for the label of every selected value of a lookup field, so no component requests one.
- `store.replace(query, view)` keeps the current query object, or its `equals`, `range` and `sort`, when the new one is equal, so Back and Forward refetch only what changed.

### Review passes over the branch

- `/code-review`: ten findings, all fixed (`92ebbcf`).
- `/security-review`: nothing at confidence 8 or above; two inputs that reached a 500 are 400s now (`e9e48df`).
- `/simplify`: fixed (`947e09a`) a double page fetch after a finished quick search, the URL sync as one tested object, labels following the query store, one `FieldFrame` per field control, range bounds and facet-field helpers shared from core, cached `Intl` formatters, one row-window hook for the bound grid and list, a lane-id index on the board. Skipped: lane feeds stay in the bound board (the spec puts them there), `capabilities.mode` stays (the spec names it), `emitter.ts` stays its own file (Glen), the catalog page keeps its own five-line sort because it shows a host with no def, and the benchmark's `measure` signature.

### Follow-ups closed after the review passes

- `createGridHandler` runs every read under `request.signal`: it is the third argument of `SqlExecutor` and of the `options` and `transitions` hooks. The demo's executor cancels the statement with `pg_cancel_backend`, on a pid it asks the server for, because a proxy such as Neon's reports its own key as `client.processID`. An aborted request is a 499 and is not reported (`c567d43`).
- `urlPrefix` on the provider namespaces a grid's URL keys, for two grids on one page (`4b932bd`).
- The counter backfill keeps the counters current through its three steps and resumes from the top or from the failed step (`1efefe1`).
- Prettier is pinned at 3.8.0 in the root `package.json` (`0b4e30b`).
- Core has its own short README; no tarball carries the root one (`cfb1f12`).
- Live per-keystroke quick search stays unbuilt: applying on Enter is the design.

## 0.3.0: shapes to core and the composition fixes (2026-11-15)

0.3.0 follows a proposal (`query-grid-0-3-proposal.md`), an independent review of it against the code (`query-grid-0-3-proposal-review.md`) and a report of 0.2.0 against three composition skills (`query-grid-skills-review.md`). Glen accepted every change in the review; where it and the proposal differ, the review won. Breaking changes were free, because nothing is published. Where a line above describes 0.2.0 and 0.3.0 changed it, the line says "since 0.3.0".

### Decided before the work

- **Shapes describe what can be answered, so they live in core.** `-postgres` keeps only what talks to Postgres. `describeShape` and all of `validateGridDef` stay there: they emit English, and their rules (a quick column needs an immutable text form, a nullable field cannot be a keyset sort) are Postgres's.
- **One home per symbol.** Nothing is exported from two entry points, and `-postgres` re-exports nothing core owns.
- **`createGridHandler` stays in `-postgres`** (see Deferred).
- **0.3.0 for all three packages.** The 0.2.0 record above describes the 0.2.0 API; shipping a different 0.2.0 would make it false.

### One def per grid (Glen, during the work)

This replaces the 0.2.0 rule that a host declares its fields once in a React-free module and builds a client def and a server def on it.

- **The host writes one object per grid**: fields (with `cell` where one is needed), shapes, sort, facet, total and storage, checked with `satisfies GridDef & PostgresGridDef`. Each package reads its slice structurally: the React package ignores `table` and `counterTable`, `-postgres` ignores `cell`, the memory source ignores shapes and storage.
- **The types stay layers, renamed so every name is unique across the packages:** core `GridDef` → `BaseGridDef` and `FieldDef` → `BaseFieldDef`; `-react` `ClientGridDef` → `GridDef` and `ClientFieldDef` → `FieldDef`; `-postgres` `ServerGridDef` → `PostgresGridDef`. Core adds `ShapedGridDef` (the base plus `shapes`), which `PostgresGridDef` extends and `createHttpSource` takes. A `BaseGridDef` passes wherever a `GridDef` is expected.
- **Capabilities come from the def.** `createHttpSource(def, basePath)` builds them from `def.shapes` and `def.facet`; the host passes none. The memory source keeps `memoryCapabilities`.
- **Demo.** `orders-grid-def.tsx` holds `ORDERS_GRID_DEF`; `orders-def.ts`, `orders-grid.tsx` and `ORDERS_CAPABILITIES` are gone. `TASKS_GRID` is `TASKS_GRID_DEF`. `SERVER_GRIDS` in `server-grids.ts` is `GRID_DEFS` in `grid-defs.ts`. Every grid def constant ends in `_GRID_DEF`. The library's own test fixtures keep `TEST_DEF`; the new React one is `TEST_GRID_DEF`.
- **What it costs, accepted:** the table and counter-table names are in the browser bundle, and the def file is a `.tsx` that the API route, the migration generator, the benchmark and the DB tests import. The 0.2.0 line "the client def carries no `table`, `shapes` or `counterTable`" now describes what the client parts read, not what the object holds.
- It went in as two commits: the type renames, then the capabilities, the demo and the docs. An intermediate two-file split (`orders-def.ts` and `orders-grid.tsx`) existed for a few commits and was replaced.

### Allowed and displayed filters (Glen, during the work)

`operators` on a field did three jobs: it declared what a client grid may filter, chose the control and decided which filters render. On a server grid it also repeated the shapes. It is gone.

- **Allowed comes from the data alone.** `Capabilities` gained `equalsFields` and `rangeFields`. `shapeCapabilities` fills them from the shapes (every field in a shape's `equals`; the sort of every shape with `range`). `memoryCapabilities` fills them from every field: a number or a date without options takes a range, anything else an equality. `isAnswerable` stays the per-query answer, so an allowed filter the current query cannot use is disabled with its reason, never hidden.
- **The control comes from the capabilities, `type` and `options`.** `resolveFilterKind(field, capabilities)`: an equality field with options is `equals`, one without is `lookup`, a range field is `range`. `listFilterFields(def, capabilities, keys?)` is every field with a kind, or the named ones in the order given. A field named in both an equality and a range gets the equality control, as `eq` won over `range` before; its range is still reachable with an explicit `RangeFilter`. `isLookupField` is gone: with no operators it only said "has no options". `listOffers` reads its candidates from the capabilities.
- **The URL keys are the capabilities' fields.** `listQueryKeys(capabilities)` gives an `f.` key per equality field and an `r.` key per range field, so the provider owns exactly the parameters its grid can filter and leaves any other alone, as before. The React package's URL helpers take the capabilities for the keys and the def for the codec.
- **`validateGridDef`** now refuses a range on a field whose type has none and an unknown equality field; "does not offer eq" and "does not offer range" went with the operators.
- **Displayed is a layout prop.** The bound `FilterBar` and `FilterSidebar` take `fields?: string[]`: the quick filter, the default control of each named field in that order, then the sort. Without it they show `listFilterFields`. `children` still replaces everything. The list is never on the def, so one grid can show three filters in its bar and eight in its sidebar, and an app that keeps the list in a settings row passes it in.
- **Demo.** The orders grid shows the same six filters as before, now because its shapes name them. The tasks grid is a client grid, so every field is allowed; its bar and sidebar pass `fields={TASK_FILTER_FIELDS}` to keep the seven they had, and every column header now offers a filter. Core's `gridDefCapabilities(def)` is what `createHttpSource` calls, and the server-rendered skeleton calls it too, to lay out the same controls.
- **Not built:** runtime add and remove (see Deferred).

### As built: core

- `model/shapes.ts` holds `OrderedShape`, `QuickShape`, `QueryShape`, `isQuickShape`, `listQuickFields`, `shapeId`, `listOrderedShapes`, `listSortFields`, `matchShape`, `isFacetOnlyQuery`, and `shapeCapabilities(shapes, options)` with `ShapeCapabilityOptions`. It imports `field-types.ts` only. The name is `shapeCapabilities` because core already exports the `Capabilities` type and `memoryCapabilities`.
- `-postgres` `shapes.ts` now holds `describeShape` and `validateGridDef` alone; `capabilities.ts` and the `./capabilities` subpath are gone; `PostgresGridDef` extends core's `ShapedGridDef`.
- `assertDeclared` needed no change: it already called core's `validateQueryValues`.
- `./http` exports `createHttpSource` and the protocol (`SUB_ROUTES`, `SubRoute`, `LIMIT_PARAM`, `EXACT_PARAM`, `ErrorBody`, `MoveBody`). The wire result types, `COUNT_CAP`, `PAGE_LIMIT_MAX`, `QUICK_LIMIT` and `OptionSearch` come from the root only.
- `createHttpSource(def, basePath)` takes a `ShapedGridDef` (a `BaseGridDef` with `shapes`) and builds its capabilities itself, with `shapeCapabilities(def.shapes, { facetField: def.facet?.field })`. No override argument was kept: nothing in the library or the demo needs one, and a host with a backend of its own writes a `DataSource`.
- `model/board.ts` is the status board's model:
  - `getLaneQueries(def, query, capabilities)` moved from the bound board unchanged.
  - `createBoard(def, source, laneQueries)` owns one query store and one feed of `LANE_PAGE_SIZE` (50) per lane and exposes `getState()` (`{ lanes, transitions }`, a lane being its `rows` and `hasNext`, the two things the board keeps current), `subscribe`, `loadMore(lane)`, `canMove(from, to)` and `move({ id, from, to, index })`.
  - `move` asks the source first and patches the two lanes with the returned row; a refused move throws and touches nothing.
  - Transitions are loaded on the first subscriber and kept per source in a `WeakMap`, because a filter change builds a new board for the new lane queries and must not fetch them again or show the loading notice again. A failed load is forgotten, so the next board retries. The server stays the authority on a move, so a list gone stale only offers a drop the server then refuses; a host whose transitions change builds a new source.
- Tests: `shapes.test.ts` (the `matchShape` and capabilities cases) and `offers.test.ts` moved to core, on a `TEST_SHAPES` fixture; `board.test.ts` is new (lane queries, lanes loaded, transitions once per source, a move patches both lanes, a refused move leaves them alone). The `validateGridDef` cases stay in `-postgres`, whose purity test now also forbids a copy of `matchShape` or `QueryShape`.

### As built: the React package

- **Barrels.** The column-state API (`createColumnStore`, `ColumnStore`, `ColumnPersistence`, `createLocalStoragePersistence`, `NO_PERSISTENCE`, the layout helpers) and `FieldDef`/`GridDef` are exported from `./components` only. The resize internals (`beginResize`, `cancelResize`, `stepWidth`, `resizeWidth`, the two step constants, `ResizeSession`) are private to `grid-header`. `useStoreValue` stays at the root.
- **Two providers.** `QueryGridProvider` (nuqs) takes `def`, `source`, `pageSize`, `urlPrefix`, `columnPersistence`. `StaticQueryGridProvider` takes the same plus a required `search`. `basePath`, `capabilities`, `syncUrl` and the runtime throw for a missing source are gone; the host calls `createHttpSource`. A memory source is created once per mount, because it holds its rows; an HTTP source can sit at module scope.
- **`columnPersistence`** is a `ColumnPersistence` and never `null`. `NO_PERSISTENCE` is the explicit "keep it nowhere". Omitted, the provider uses `createLocalStoragePersistence("query-grid:<def.id>:columns")` and the base `DataGrid` uses `NO_PERSISTENCE`, as before. `createColumnStore` takes a persistence, not a nullable one.
- **`useQueryGridActions()`** returns `dispatch`, `loadMore`, `requestExact`, `setView`, `rememberLabel`, `loadOptions(field, text, signal)` and `moveRow(board, move)`. The object is built once with the context value, so it is stable. `useQueryGrid` and `QueryGridContextValue` are no longer exported; the internal context is the same value plus `actions`, and the `./ui` wrappers still read `def` and the stores from it. `useQueryDispatch` is gone: `dispatch` has one home, the actions.
- **`moveRow(board, move)`** takes the board as an argument, because the board is created by the component that renders it and is rebuilt when the lane queries change. It runs `board.move`, patches the grid's own feed, and reloads the facet counts, the count and the total. The bound `StatusBoard` keeps `useState(() => createBoard(…))`, the error message and the rendering; its `useEffect` fetch is gone.
- **One filter-kind rule.** Core's `resolveFilterKind(field)` answers `"lookup"`, `"equals"`, `"range"` or `null`; `listFilterFields` and the bound `FieldFilter` both read it.
- **Filter variants.** `./components` exports `EqualsSelect`, `LookupFilter` (`loadOptions` required) and `RangeFilter`, each with its own props and each inside its own `FieldFrame`, as `SortControl` and `QuickFilter` already were; no `Framed*` twin was added. The base `FieldFilter` is gone. The def-driven `FieldFilter` in `./ui` switches on `resolveFilterKind`.
- **`showReason` is a context.** `ReasonDisplayContext` in `components/field-frame.tsx` (now a client module) is set by the base `FilterSidebar` and exported for a host's own container. No control takes a `showReason` prop.
- **Bound `FilterBar` and `FilterSidebar`** take optional `children` and default to the quick filter, every filter field and the sort.
- **Compound `DataGrid`**, base and bound: `DataGrid.Root`, `.Toolbar`, `.Status`, `.ColumnsMenu`, `.Body`, with `<DataGrid />` as the default composition.
  - `Root` owns the `usePrimitive` handle, the column state, the layout, the reset-key epoch and both effects, renders the `qg-grid` element and shares them through a context inside `components/data-grid.tsx`. A part outside a `Root` throws.
  - `Status` still reads the handle through the status part's `children` function; `Body` is the root part.
  - The parts hang off the component with `Object.assign`, so `DataGrid.Root` is reached from a client component; a server component can render `<DataGrid />` but cannot read a property of a client reference.
  - The bound `Root` reads the provider; the other four bound parts are the base parts.
  - The select column stays in `Body` in every composition. It is not a part and has no opt-out: making it one changes every grid screenshot and the browser pass for no user gain.
- **`CardList` takes `ClientFieldDef[]` (Glen, relayed through the 0.2.0 review session)** and renders a field through its `cell` when it has one: after the label in the title, inside the badge pill and in a body detail. The cell replaces the formatted value and the card's frame stays, so the demo's status badge now shows on the cards. The bound wrapper already passed the client fields; only the base type dropped `cell`. A render prop for a whole custom card was not added: with it `titleField` and `badgeField` mean nothing, which is the mode-switching prop union 0.3.0 removed from `FieldFilter`. A compound (`CardList.Root` plus a card part, as `DataGrid` now has) is the form that fits, and is left for when a host needs it.
- `ui/ui.test.tsx` is new: the bound containers' default and given children, and the bound grid's parts with the columns menu mounted outside it.

### As built: the demo

- **Server workspaces.** `OrdersWorkspace`, `RestyledWorkspace`, `TasksWorkspace`, `CatalogWorkspace` and `OrdersPart` are server components. Brand, title, copy and footer render on the server, outside any boundary. The client modules are the providers (`orders-provider.tsx`, `tasks-provider.tsx`), the view pickers (`orders-view.tsx`, `tasks-view.tsx`), `query-readout.tsx`, `catalog-grid.tsx` (it holds the page's `useState`) and the package's own parts.
- **The boundary wraps the grid parts only**: `<Suspense fallback={<OrdersSkeleton />}><AtRequest>…provider and parts…</AtRequest></Suspense>` inside the workspace. `AtRequest` is kept and not renamed: it is what server-renders a deep link. The page files only compose.
- **One provider still covers the count, the view switch and the total**, which sit on the header and footer rows beside server chrome. The workspace is a CSS grid with named areas (`head tools`, `note`, `body`, `total foot`), one template per breakpoint: the server header and the island's tools share the first row, the island's total and the server footer the last. The pixels match 0.2.0. Under 900 px the rows stack and wrap, as the flex header did.
- **Skeletons.** `WorkspaceSkeleton({ def })` in `lib/workspace-skeleton.tsx` is the fallback of the orders and tasks workspaces, and is derived from the def: one placeholder per filter control by its kind, the facet column and the total row only when the def declares them. `RestyledSkeleton` and `OrdersPartSkeleton` sit beside theirs and use the same pieces. None has visible text; each has a `role="status"` label. `lib/workspace-parts.tsx` holds the tools, filters, facets and total that the orders and tasks workspaces share, so the real layout and its skeleton are one file apart. `lib/page-loading.tsx` is gone.
- **`/parts/[part]`** is `params.then(({ part }) => …)` with `generateStaticParams` from `PART_NAMES`, `notFound()` for anything else, and the generated `PageProps<"/parts/[part]">`. `OrdersPart` takes `part`. With `generateStaticParams` the page needs no boundary of its own, so an unknown part is a real 404 and not a not-found page streamed under a 200. This is the one place a promise's `.then` is called in render; AGENTS.md names the exception.
- **Demo `typecheck`** is `next typegen && tsc --noEmit`, so the generated `PageProps` exists on a clean checkout.
- **`error.tsx` and `not-found.tsx`** at the app root; the error page takes this Next version's `{ error, retry }`.
- **`lib/db.ts`** is `import "server-only"` plus a re-export of `lib/pg-executor.ts`, which holds the pool and `executeSql` and is what the bun DB test imports. `server-only` is a demo dependency.
- **Placement.** `core/orders/orders-provider.tsx`, `core/tasks/ui/`, `core/catalog/ui/`, `core/landing/` (`landing-copy.ts` and `ui/landing.tsx`; the page composes five sections).
- **Title prop.** `OrdersWorkspace` takes `title`; `dir` no longer picks the heading.
- `verify.sh` gained a `shift` section: the static shell of each grid route holds the brand and a skeleton and no loading text, and the cumulative layout shift of each grid page is read from the browser.

### Layout shift (Glen, during the work)

The grid pages load with no layout shift: the browser reports no `layout-shift` entry on any of twelve grid pages at 1500 and at 800 px wide. Four things moved, and each was fixed at its cause.

- **The shell.** The whole page used to sit behind one boundary with a loading text. The chrome is now outside the boundary and the fallback is a skeleton with the same boxes (see the demo, above).
- **The grid's status line.** It wrapped to a second line whenever its text grew, which moved the grid. It is now two groups that never wrap: what was loaded and the paging progress first, taking the free space and clipping at the end, then the selection, active cell and range, at a fixed place beside the Columns button. In a toolbar narrower than 44rem (a container query) the two groups are always two lines. The text "0 rows loaded in 0 keyset pages" is no longer shown before the first page has arrived (the same "nothing fetched yet" test the grid's notice uses), so nothing grows when it does. The grid and the card list render the line through one `LoadedText`.
- **Facet counts.** The bound `FacetPanel` showed `0` for every count until the facet counts arrived. It now shows no count until they have loaded: core's count, total and facet resources carry a `loaded` flag, so a result that is empty is still shown as zeros.
- **The view switch.** UI SDK's indicator is measured in the browser, so in the server HTML it sat at the start of the control and jumped to the checked item on hydration. `ViewSwitch` mounts the indicator on the client only (`useMounted`, a `useSyncExternalStore` whose server snapshot is `false`).

`verify.sh shift` measures it: every entry counts, including the ones a browser would excuse as following an input, because the section loads pages and touches nothing.

### Not doing

- Renaming `http.ts` and `memory.ts` to `index.ts`: zero-logic barrels, naming only.

### Review passes over the 0.3.0 branch

- `/code-review` (high): nine findings, eight fixed (`b8af673`): an unknown part answered 200 where it now answers 404, the workspace header overflowed under 900 px, the skeleton had no accessible status, JSX sat in a default parameter, two skeletons and three filter frames were copies, and `moveRow` had no test. One was left as designed: transitions are kept per source (see core, above).
- `/security-review`: nothing at confidence 8 or above. The moved shape helpers are byte-identical, `assertDeclared` still runs before any SQL exists, and the pg pool stays behind `server-only`.
- `/simplify`: fixed (`92c3e29`) the grid internals reading the grid context where they were handed its fields as props, one `resolveFilterKind` rule in core, `dispatch` in one hook, a lane state of `rows` and `hasNext` only, one source stub and one def for the tests, the workspace parts shared by orders and tasks, a skeleton derived from the def, named grid areas, and a `shift` check that probes by hook. Skipped: a shared workspace shell component (four workspaces differ in note, footer and boundary), releasing a dead board's lane subscriptions and splitting the grid context in two (both measured as negligible).

- A second round over the later commits (`92c3e29..HEAD`: the type renames, one def per grid, the layout-shift fixes, the allowed filters). `/code-review`: eight findings, six fixed: a `loaded` flag where an empty facet result hid the counts, the URL keys taken from the capabilities again, a toolbar that keeps its width under containment, one `listFilterFields` rule for the bar and the skeleton, `isLookupField` removed. Two left as designed: the view switch has no indicator until hydration, and `enumerateReachableStates` over a client grid grows with every field, so it is a tool for server grids. `/security-review`: nothing; no request-time check ever read `operators`, and `assertDeclared` is unchanged. `/simplify`: fixed the pre-fetch "0 rows loaded" text that the first fix missed, a named and scoped container query on logical sizes, one `LoadedText` for the grid and the list, and two shape helpers made private. Skipped: `shapeCapabilities(shapes, options)` keeps its options argument (decided), `validateGridDef` stays in `-postgres` (decided), and equality keeps its precedence over range.

### Review of the 0.2.0 follow-ups

The six commits after the 0.2.0 review passes (`a6d4577..3e8b8ce`: abort through `request.signal`, `urlPrefix`, the resumable counter backfill, the prettier pin, the per-package READMEs and the records) had not been reviewed. They were, against the 0.3.0 code.

- `/code-review`: six findings, five fixed. The demo executor's cancel borrowed a connection from the pool it was cancelling for, so four aborts at once could wedge the four-connection pool for good; it now opens its own short connection. A failed `ROLLBACK` released a connection still inside an aborted transaction; that connection is now destroyed and the original error kept. An abort silenced every error, so a real failure on an aborted request went unreported; only the abort's own error is silent now. `walkGridPages` checks the signal before each page. Left: the cached backend pid assumes a direct connection, which the comment now says (a transaction pooler would point it at another session's backend).
- `/security-review`: nothing at confidence 8 or above. Every identifier in the backfill DDL passes `identifier()`; `SET LOCAL` only ever receives the runner's constants; the 499 and 500 bodies carry no detail.
- `/simplify`: fixed one cancel promise for the array that could only hold one, one `normalizeSearch` loop with no special case for no prefix, one option query chosen per branch in the demo handler, and a test that only demonstrated the problem `urlPrefix` solves. Skipped: binding the signal into the executor in the handler (it would change the exported runner functions, whose signal argument is recorded above), asking the backend pid on the pool's connect hook, and folding the handler tests into the shared harness.

### Definition of done (0.3.0)

1. Typecheck, lint and unit tests pass in the three packages and the demo; the purity tests pass, with `matchShape` and `QueryShape` in the `-postgres` copy check.
2. `test:db`, `db:check` and `db:bench` at 72 of 72 single-value and 80 of 80 multi-value.
3. The scripted browser pass is green on `next start` at port 3040, with `/rtl`, `/components` and `/parts/*`, and no layout shift on the grid pages.
4. Screenshots: dropped by Glen during the work. `docs/screenshots` stays as 0.2.0 left it.
5. `npm pack --dry-run` succeeds for the three packages at 0.3.0.
6. The root README, the package READMEs, AGENTS.md and this file are updated.
7. `/code-review`, `/security-review` and `/simplify` have run over the change set, their fixes are applied and the gates re-run.
8. `main` is fast-forwarded to the branch. Nothing is pushed or published.

### Verification record (0.3.0)

Observed 2026-11-15 on the final code, against Neon (620,000 orders). The README's "Verification record" holds the browser pass row by row.

| #   | Item                  | Command                                                                            | Observation                                                                                                                                                                                                                                                                                                                                                    |
| --- | --------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Unit gates and purity | `bun run typecheck`; `bun run lint`; `bun run test`                                | all exit 0; 64 core, 57 postgres, 62 React and 4 demo tests; core's root now exports the shape types, `matchShape` and `shapeCapabilities` and still no DDL or SQL symbol; `-postgres` defines no copy of `matchShape` or `QueryShape` and has no `./capabilities` subpath; the seven entry points import in plain Node ESM                                    |
| 2   | Database gates        | `bun run --filter demo test:db`; `db:check`; `db:bench`                            | 26 DB tests in 3 files pass; the migration file matches `GRID_DEFS`; BENCH_RESULT                                                                                                                                                                                                                                                                              |
| 3   | Browser pass          | `bun run build`; `bun run --filter demo start`; `bash apps/demo/browser/verify.sh` | 19 sections on port 3040 at 1500 by 900, every observation as recorded in the README; each grid route's static shell holds the brand and a skeleton and no grid part; cumulative layout shift 0.0000 on twelve grid pages at 1500 and at 800 px wide, every entry counted; `/parts/nope` is a 404; agent-browser `errors` empty and the `next start` log clean |
| 5   | Release prep          | `npm pack --dry-run` in each package                                               | three tarballs at 0.3.0: core 53 files, `-postgres` 19, `-react` 76 with `dist/styles.css`; nothing published                                                                                                                                                                                                                                                  |
| 6   | Docs                  | read them                                                                          | README (Packages, Quick start on one def, Capabilities, Base components, hooks, Design as built, the record), the three package READMEs, AGENTS.md (the core row, the one-def rule, the `params.then` exception) and this file (the 0.3.0 section, "since 0.3.0" on the changed 0.2.0 lines, Deferred)                                                         |
| 7   | Review passes         | `/code-review`, `/security-review`, `/simplify`                                    | run over `3e8b8ce...HEAD`; fixes in `b8af673` and `92c3e29`; every gate above re-run after them and after the one-def, layout-shift and allowed-filters commits                                                                                                                                                                                                |
| 8   | Fast-forward          | `git merge --ff-only` in the main checkout                                         | recorded in the final report                                                                                                                                                                                                                                                                                                                                   |

## Definition of done (0.2.0)

1. **Package layout:** three packages with rev 2's exports. `./server` is gone and core exports no storage type or function. Core has no React, DOM or `pg` import; `-postgres` has no React or `pg`.
2. **Base components:** every base component in `./components` renders with no provider and no query concepts, and a test mounts each one standalone with plain props.
3. **Bound wrappers:** every wrapper in `./ui` renders its base component from the provider, and no base component file imports a provider hook.
4. **Server handler:** `createGridHandler` replaces the demo's seven route files and `respond()` with one catch-all route, with tests for every route, 400/404/409/500, the non-numeric `limit` and the error body.
5. **Capabilities and the contract:** `capabilities(shapes)` feeds the provider; the demo's reachable-states test runs against it, with several values; a round-trip test proves `encodeQuery` in `-react` and `decodeQuery` in `-postgres` are core's one codec.
6. **Localization:** no English literal in components, the model or wire responses outside the default messages; plurals through `Intl.PluralRules`; a test renders with overridden messages.
7. **RTL:** the demo has a `dir="rtl"` route; column resize, drag, pinning, the sidebar side and chips behave correctly in the browser.
8. **Gates:** typecheck, lint, every unit and DB test, `db:check` and the benchmark (72 of 72) pass.
9. **Browser pass:** the full scripted agent-browser pass is green on a local production build against Neon, with no browser errors, and every row of the README record is re-run.
10. **Docs:** the README is migrated, and each package has its README, LICENSE and prepack.
11. **Release prep:** three packages at 0.2.0, `npm pack --dry-run` lists the right files for each, nothing published.
12. **Screenshots:** all retaken from the local production build, plus the RTL route and a base component standalone.
13. **Verification is complete:** every row below carries an observation.
14. **Multi-value IN:** `= ANY`, the `maxValues` refusal, `multi: false`, facet sums, the multi-select and chips, and the memory adapter work end to end; their tests, the DB test and the benchmark's multi-value cases pass.

Added by Glen during the work: URL history through nuqs, and the migration generator at scale.

## Verification record (0.2.0)

Observed 2026-11-14 on the worktree branch, against Neon (620,000 orders). The README's "Verification record" holds the browser pass row by row.

| #   | Item                         | Command                                                                                                                               | Observation                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Package layout               | `ls packages`; each `package.json`; `bun run test` (`purity.test.ts` × 3); `node -e "import(...)"` × 8                                | `query-grid`, `query-grid-react`, `query-grid-postgres` at 0.2.0 with the spec's exports; no `./server`; core's root exports no DDL or SQL symbol (and, in 0.2.0, no shape symbol; since 0.3.0 the shapes are core's); core has no dependency, no React, UI SDK, `pg` or DOM global, and compiles without the DOM lib; `-postgres` depends on core alone; all eight entry points import in plain Node ESM                 |
| 2   | Base components              | `bun run test` in `-react` (`components.test.tsx`); `/components` in the browser                                                      | 15 standalone mounts cover all fourteen components with plain props and no provider; `/components` filters, sorts and resizes sixty constant rows with 0 `/api` requests                                                                                                                                                                                                                                                  |
| 3   | Bound wrappers               | `bun run test` (`components/purity.test.ts`)                                                                                          | no file in `src/components` matches a provider hook, a store factory, `DataSource`, `Capabilities` or the URL codec; `src/ui` holds one wrapper per base component under the same name                                                                                                                                                                                                                                    |
| 4   | Server handler               | `bun run test` in `-postgres` (`grid-handler.test.ts`, 20 tests); `curl` on the running demo                                          | page, `/count`, `/total`, `/facets`, `/options`, `/transitions`, `POST /status`; 400, 404, 405, 409, 500; `limit=abc`, `1.5`, `-3`, `0`, empty and `1e3` all 400 with no SQL built; body `{ error, message, code, params }`; the demo's `api/orders` is one `[[...route]]/route.ts` and `lib/api-response.ts` is gone                                                                                                     |
| 5   | Capabilities and contract    | `bun run test` (`offers.test.ts`, `orders-grid-def.test.ts`, `grid-handler.test.ts`)                                                  | every reachable state of the test def and the orders def matches a shape and every shape is reached, with several values among them; a query encoded by core reaches the SQL through the handler as `= ANY($1::text[])`; `createHttpSource` driven against the handler speaks the same routes; `-postgres` defines no codec of its own                                                                                    |
| 6   | Localization                 | `bun run test` (`components/purity.test.ts`, the messages tests); `grep` for string literals with spaces across the three `src` trees | no JSX text or literal label outside `messages.tsx`; core and wire bodies carry codes only; what the grep leaves is developer text: `validateGridDef`, `describeShape`, SQL comments, thrown programming errors, one UI SDK `keys` note; Welsh plurals select `two` and `few`; overridden messages replace the defaults in the grid, count and chips                                                                      |
| 7   | RTL                          | `verify.sh rtl` on `/rtl`                                                                                                             | computed direction `rtl`; select column 1–41 px and pinned Order 41–151 px from the right edge, unchanged after scrolling; resize handle on the header's left edge, 200→300 by dragging left, Left grows and Shift+Right shrinks; keyboard and pointer reorder mirror; pinned Customer starts 151 px from the right; sidebar at x 0–368; chips and remove buttons mirrored                                                |
| 8   | Gates                        | `bun run typecheck`; `bun run lint`; `bun run test`; `bun run --filter demo test:db`; `db:check`; `db:bench`                          | all exit 0, re-run on the final code after the review passes; 40 + 71 + 51 + 4 unit tests; 26 DB tests in 3 files; the migration file matches the defs; benchmark 72 of 72 single-value and 80 of 80 multi-value                                                                                                                                                                                                          |
| 9   | Browser pass                 | `bun run build`; `bun run --filter demo start`; `bash apps/demo/browser/verify.sh`                                                    | 18 sections, every observation as recorded in the README, re-run on the final code after the review passes at a fixed 1500 × 900 viewport; the status counts move by one per pass, because the pass itself moves a card; agent-browser `errors` empty and the `next start` log clean                                                                                                                                      |
| 10  | Docs                         | read `README.md`; `ls packages/*/README.md packages/*/scripts`                                                                        | README migrated: Packages, Install, Quick start, Capabilities, Base components, Localization, Right to left, Several values per field, hooks alone, in-memory source, Design as built, Releasing, exports; `-react` and `-postgres` have their own README, core takes the root one at prepack; each has `build.ts`, `copy-docs.ts` and a `prepack`                                                                        |
| 11  | Release prep                 | `npm pack --dry-run` in each package                                                                                                  | three tarballs at 0.2.0 holding `dist`, README, LICENSE and `package.json`; `-react` also `dist/styles.css`; nothing published                                                                                                                                                                                                                                                                                            |
| 12  | Screenshots                  | `bash apps/demo/browser/shots.sh`                                                                                                     | 24 PNGs in `docs/screenshots`, 21 retaken plus `22-several-values`, `23-right-to-left`, `24-base-components`                                                                                                                                                                                                                                                                                                              |
| 13  | Verification complete        | this table                                                                                                                            | every row has an observation                                                                                                                                                                                                                                                                                                                                                                                              |
| 14  | Multi-value IN               | `bun run test`; `test:db`; `db:bench`; `verify.sh multi customer`                                                                     | SQL `= ANY` with one array parameter; `too_many_values` refused in core, in the builder and by the handler; a `multi: false` shape refuses two values and offers one; two statuses read the sum of two counters for count, total and facets; Select in `multiple` mode and a Combobox with chips; one chip per field with a remove per value; the memory source matches any value; 4 DB tests and 80 benchmark cases pass |
| +   | URL history with nuqs        | `bun run test` (`query-grid-provider.test.tsx`, `url-sync.test.ts`, core's store tests); `verify.sh history`                          | parser map built from the def; a deep link starts the store with several values, a sort and a view, and is server-rendered that way; four discrete changes add four history entries, Back undoes each, Forward redoes; quick filters add none; a `<Link>` to the board is followed                                                                                                                                        |
| +   | Migration generator at scale | `bun run test` (`sql-builder.test.ts`); `test:db` (`backfill-db.test.ts`); `db:migrate`                                               | `CREATE INDEX CONCURRENTLY` one statement each; backfill exact under concurrent writes and an open transaction, with no lock across the scan, counters current through an interrupted run and exact after the next one; a long index name is shortened to 63 characters with a hash; three defs on two tables give two migrations; 14 steps applied to Neon in 3.7 s                                                      |

## Outstanding and unverified

Nothing closable in development is open.

- **Not run, because it is Glen's:** `npm publish` of the three packages, pushing the branch, and deploying 0.3.0 to Vercel. Until then the deployed demo and the public repository show 0.1.0, and the README's two 0.1.0 rows for them were not re-run.
- **Not built:** live search on each keystroke in the quick filter. It applies on Enter, as before.
- **Not built:** a render prop or a compound for a whole custom card in `CardList` (see the 0.3.0 React section).
- **Accepted with the one-def design:** the table and counter-table names are in the browser bundle.
