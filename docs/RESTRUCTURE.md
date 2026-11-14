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
