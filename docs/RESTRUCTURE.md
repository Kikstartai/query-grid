# query-grid restructure: spec (2026-11-14, rev 2: three packages)

Glen settled every decision here. This spec combines the design note (`query-grid-restructure-design.md`), the independent review against the code (`query-grid-restructure-review.md`, which holds the `path:line` evidence) and Glen's answers. Rev 2 replaces the two-package split with three packages and drops the duplicated contract. Paths are relative to today's `packages/query-grid/src` unless they start with `apps/`.

## Model
A React-free core holds the query model. A React package on UI SDK holds controlled base components, plus the constrained grid bound to the core. A Postgres package holds the server. Every base component works without the constraint, the query layer and any provider.

## Packages: three npm packages in one repo, released together at 0.2.0
Nothing is published yet, so the names change freely.

| Package | Depends on | Role |
|---|---|---|
| `@kikstart/query-grid` | nothing (no React, no pg, no DOM) | core |
| `@kikstart/query-grid-react` | core, React, UI SDK | components + bound grid |
| `@kikstart/query-grid-postgres` | core (no React, no pg) | server |

There is **one query contract**, in core. `-react` and `-postgres` both import it, and nothing is duplicated.

### `@kikstart/query-grid` (core)

| Export | Holds |
|---|---|
| `.` | The query contract: QueryState, the React-free field types, `KEY_FIELD`, `QUICK_MIN_LENGTH`/`QUICK_MAX_LENGTH`, `PAGE_LIMIT_MAX`, `COUNT_CAP`, `QUICK_LIMIT`, `formatCount`. Also validation (`validateQueryValues`), the URL `encodeQuery`/`decodeQuery`, the query state and emitter-based stores (`model/emitter.ts`), actions and offers (`applyAction`, `listOffers`, `explainUnavailable`), refusal reason codes, feeds (`react/feed.ts` split into rows and summaries), the `DataSource` contract, the `Capabilities` type, and message codes and params. It holds no transport. |
| `./http` | `createHttpSource` (today's HTTP client in `model/data-source.ts:63–100`), plus the wire types, route paths and error body shared with `createGridHandler`. |
| `./memory` | The in-memory source (today's `model/memory-source.ts`), including memory-mode capabilities derived from field operators plus a `quick` field list (`model/shapes.ts:78–92`). |

### `@kikstart/query-grid-react`

| Export | Holds |
|---|---|
| `./components` | Controlled base components: DataGrid, FilterBar, SortControl, QuickFilter, FieldFilter, FilterChips, FilterSidebar, FacetPanel, CardList, StatusBoard, ViewSwitch, ColumnsMenu, CountDisplay, TotalFooter, plus `QueryGridMessagesProvider` and `useMessages`. Props in, callbacks out. Each option may carry `disabled` and `reason`. No query, adapter, index or URL concepts. |
| `.` | `QueryGridProvider`, its hooks (`react/use-store-value.ts` and the rest), `useOfferState`, and the client field type, which extends core's field type with `cell` (ReactNode). |
| `./ui` | Thin bound wrappers, one per base component, with **the same names as the base components** (`DataGrid`, `FilterBar`, …). They read the provider and render the base component. |
| `./styles.css` | The package stylesheet, which replaces `./ui/styles.css`. Consumers import `@ui-sdk/core/web.css` first. |

- **Base DataGrid contract:** `rows`, `hasNext`, `onEndReached`, `loading`, plus column state.
- **Column state** (order, width, visibility, pin) is internal by default, with an optional controlled mode (`columns` + `onColumnsChange`). Persistence goes through the existing `ColumnPersistence` abstraction (`model/column-state.ts`). It lives in `-react`, because only the grid uses it.
- **StatusBoard** is generic: `lanes`, `onMove(id, to)`, `canMove(from, to)`. Its per-lane feeds and query stores (`ui/status-board.tsx:359–360`) move into the bound wrapper.
- **Hook calls:** all 67 provider hook calls across 10 ui files move into the bound wrappers, including the direct `useStoreValue` calls in status-board (`:569`, `:643`) and `useOfferState`.
- **No `@tanstack/query-core`.**

### `@kikstart/query-grid-postgres`
- **Imports core** for the contract, validation, `decodeQuery`, `formatCount`, and the wire types and route paths from `@kikstart/query-grid/http`. It holds no copy of any of them.
- **Storage:** storage config (table, shapes, counterTable), `validateGridDef`, the shape helpers (`matchShape`, `shapeId`, `describeShape`, `listOrderedShapes`, the `OrderedShape`/`QuickShape`/`QueryShape` types), shapes → capabilities, refusal (`assertDeclared`, `QueryRejected` with code + params), the SQL builder, the runner, the keyset cursor and the migration/index generator.
- **`capabilities(shapes)`:** a browser-safe export the host passes to the provider.
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
- **One field description type** (Q2) drives the grid and the filters: key, label, type, operators, options, lookup, width, pinned, hidden, wrap, nullable. The React-free type lives in core, and `-react` extends it with `cell`.
  - The host declares its fields once, in a React-free module.
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
- **Reachable states:** the demo's reachable-states × `matchShape` invariant test (`apps/demo/src/core/orders/orders-grid-def.test.ts`) stays, pointed at `capabilities(shapes)`.
- **SQL builder:** `server/sql-builder.test.ts` gets its own fixtures in `-postgres`. `model/query-model.test.ts` splits into a shape part (`-postgres`) and an action part (core).
- **Carried over:** every existing unit, DB and benchmark test is carried over.

## Release
- **Versions:** all three packages go to 0.2.0 together. It's a breaking change.
- **Docs and demo:** the demo and the README migrate in the same release: Quick start, "Using the hooks alone", "The in-memory data source", "Design as built", "Releasing" and the exports.
- **Build:** each package has its own README, LICENSE and build and prepack scripts (`scripts/build.ts`, `copy-docs.ts`).
- **Publishing:** prepare it only; Glen publishes all three packages.

## Deferred
- a separate components npm package
- a migration CLI (the demo keeps `db/generate-migration.ts`)
- generic status moves on the server beyond the `moves` hook
- a separate memory adapter package (it is the `./memory` subpath)

## Scale
This is library code with nothing that grows with a tenant count. Each request is one query against a declared shape's index. The benchmark proves 72 of 72 shapes on 620k rows. Capabilities are computed once per def.

## URL history with nuqs (added later, Glen)
- `-react` only: `QueryGridProvider` uses **nuqs** for the URL; nuqs stays internal to the provider and hosts mount a nuqs adapter (Next for the demo, plain React otherwise). Core and `-postgres` gain no nuqs dependency.
- Discrete changes (filter, sort, view, reset) push a history entry; quick-filter typing replaces with throttling. Back/Forward and Next `<Link>` changes flow back into the grid.
- The URL is the source of truth: `dispatch` still runs `applyAction` + the answerable check, then writes through nuqs; the query store follows. Core's query store gains a framework-free way to take a query from outside (e.g. `replace(query)`, validated, falling back to the default).
- The nuqs parsers are built at runtime from the GridDef on top of core's `encodeQuery`/`decodeQuery`, so browser and server read one URL format (`f.<field>`, `r.<field>=min..max`, `q`, `sort`, `view`). Verify nuqs supports the dynamic keys.
- Column layout stays out of the URL.

## As built: calls the spec left open

### Names and types
- Core's field type is `FieldDef`; `-react` adds `ClientFieldDef` (with `cell`) and `ClientGridDef`. Core's `GridDef` is generic over its field type, so one def shape serves both.
- The server def is `ServerGridDef extends GridDef`: it adds `table`, `shapes` and `facet.counterTable`, and keeps `id`.
- `QueryMode` is `"server" | "memory"`; the old `"indexed"` is gone.
- `QueryRules` is `{ capabilities, quickComplete }`. `applyAction`, `listOffers`, `listControlActions` and `enumerateReachableStates` take it as a required argument; `explainUnavailable(query, target, rules)` no longer takes a def.
- `DataSource.mode` is replaced by `DataSource.capabilities`. The provider takes `capabilities` for the HTTP source and throws if it has neither a source nor capabilities.

### Capabilities
- `capabilities(shapes, { facetField })` takes the facet field as an option, because `isFacetCountShown` needs it and shapes do not name it.
- It is exported from the `-postgres` root and alone from `@kikstart/query-grid-postgres/capabilities`, which a browser bundle imports without the SQL builder.
- `memoryCapabilities(def, quickFields)` is exported from `@kikstart/query-grid/memory`; `createMemorySource` takes the quick fields as `options.quick`.

### Wire
- The result types live in core's root, because `DataSource` names them, and are re-exported from `./http` beside `SUB_ROUTES`, `LIMIT_PARAM`, `EXACT_PARAM`, `ErrorBody` and `MoveBody`.
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
- `FilterBar` and `FilterSidebar` are containers that take children; the bound ones fill them.
- Column state in the base grid is a hook over `useState` with optional persistence. Under the provider it is `createColumnStore`, which lives in `-react` beside the provider.
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
- `orders-fields.ts` is the shared React-free module; `orders-server-def.ts` and `orders-grid-def.tsx` build on it. The client def adds a status badge cell.
- New routes: `/rtl` and `/components`.
- `apps/demo/browser/verify.sh` and `shots.sh` are the scripted pass and the screenshots.

## Added after rev 2, at Glen's word: as built

### URL history with nuqs
- nuqs is a peer dependency of `-react` (`>=2.10.0`, the version checked for `parseAsNativeArrayOf`), because the host's adapter and the provider must share one copy. Core and `-postgres` have none.
- nuqs supports the dynamic keys: the parser map is a plain object built once per def from core's new `listQueryKeys(def)`. An `f.<field>` key is `parseAsNativeArrayOf(parseAsString)`, so several values repeat the parameter; the rest are `parseAsString`.
- The values nuqs reports are turned back into a search string and decoded with core's `decodeQuery`; a state is written by encoding it with core's `encodeQuery` and splitting it by key. No second codec exists.
- Core's store gained `replace(query, view?)`, `normalizeQuery(def, capabilities, query)` and `getHistoryWrite()`. `replace` and store creation both normalize: a query nothing answers, or with an invalid value, becomes the default.
- `dispatch` applies the action in the store at once and the provider writes the result through nuqs; when nuqs reports anything else, the store follows it. The store never disagrees with the URL for longer than one render.
- A filter, range, sort, view or reset pushes. `setQuick` and `clearQuick` replace, throttled to 250 ms. The quick filter still applies on Enter, so "typing" is each applied term; live search per keystroke was not built, because each term is a trigram query under a 120 ms budget.
- A URL nothing answers is rewritten in place to the default; a parameter the def does not own is left alone.
- `syncUrl={false}` renders a provider that calls no nuqs hook and needs no adapter; it starts from `search` and follows it. Under nuqs the `search` prop is unused.
- The demo mounts `NuqsAdapter` from `nuqs/adapters/next/app` in the root layout. Its pages no longer pass `searchParams`; an `AtRequest` server component awaits `connection()` inside the Suspense boundary, so a deep link is still server-rendered with its state.
- Column layout stays out of the URL.

### Migration generator at scale (design note, question 9)
- Indexes are `CREATE INDEX CONCURRENTLY IF NOT EXISTS`, one statement each, outside any transaction. `{ concurrently: false }` opts out.
- The counter backfill is three transactions: install the triggers in logging mode; backfill from one `REPEATABLE READ` snapshot and delete the logged changes that snapshot can see; fold the rest and switch to direct mode. `SHARE ROW EXCLUSIVE` is held for the trigger swap and the fold only.
- It is a snapshot backfill, not a batched one. Batches cannot be exact without a watermark that every write reads for the life of the table.
- `shortenIdentifier` keeps a name within 63 characters with an FNV-1a hash suffix. It covers index names and the counter's function, trigger and pending-table names.
- `listTableMigrations(defs)` gives one migration per table and writes a shared index once; `validateGridDefs(defs)` validates them together; `listGridMigrationSteps(def)` gives the steps to send one at a time.
- `PgIndexRow.valid` lets `listMissingIndexes` treat an invalid index as missing.
- The demo writes `db/migrations/0002_query_grid_<table>.sql` and applies the steps one at a time.
- The index count stays the cost of principle 1; the README says so under "Cost at scale".
