# query-grid restructure: spec (2026-11-14)

Glen settled every decision here. This spec combines the design note (`query-grid-restructure-design.md`), the independent review against the code (`query-grid-restructure-review.md`, which holds the `path:line` evidence) and Glen's answers to the open questions. Paths are relative to `packages/query-grid/src` unless they start with `apps/`.

## Model
A component library is the base, and the constrained query grid is built on top of it. Every base component works without the constraint, the query layer and any provider.

## Packages: two npm packages in one repo, released in lockstep at 0.2.0

### `@kikstart/query-grid` (React + UI SDK); the name stays

| Export | Holds |
|---|---|
| `./components` | Controlled base components: DataGrid, FilterBar, SortControl, QuickFilter, FieldFilter, FilterChips, FilterSidebar, FacetPanel, CardList, StatusBoard, ViewSwitch, ColumnsMenu, CountDisplay, TotalFooter, plus `QueryGridMessagesProvider` and `useMessages`. Props in, callbacks out. Each option may carry `disabled` and `reason`. No query, adapter, index or URL concepts. |
| `.` | The constrained layer: GridDef, query state and store, actions and offers (`applyAction`, `listOffers`, `explainUnavailable`), validation, URL `encodeQuery`/`decodeQuery`, data loading (rows, count, total, facets, labels), the `DataSource` contract, the HTTP client source, the memory adapter, `QueryGridProvider`, its hooks, and `useOfferState`. |
| `./ui` | Thin bound wrappers, one per base component, with **the same names as the base components** (`DataGrid`, `FilterBar`, …). They read the provider and render the base component. Demo imports from `./ui` keep working. |
| `./styles.css` | The package stylesheet, which replaces `./ui/styles.css`. Consumers import `@ui-sdk/core/web.css` first. |

- **Base DataGrid contract:** `rows`, `hasNext`, `onEndReached`, `loading`, plus column state.
- **Column state** (order, width, visibility, pin) is internal by default, with an optional controlled mode (`columns` + `onColumnsChange`). Persistence goes through the existing `ColumnPersistence` abstraction (`model/column-state.ts`).
- **StatusBoard** is generic: `lanes`, `onMove(id, to)`, `canMove(from, to)`. Its per-lane feeds and query stores (`ui/status-board.tsx:359–360`) move into the bound wrapper.
- **Stores:** keep the emitter-based stores read through `useSyncExternalStore`. They live only in the constrained layer.
- **No `@tanstack/query-core`.**
- **Feed split:** split `react/feed.ts` into rows and summaries. It has no React import, so it moves out of `react/`.
- **Hook calls:** all 67 provider hook calls across 10 ui files move into the bound wrappers. That also covers the direct `useStoreValue` calls in status-board (`:569`, `:643`) and `useOfferState`.

### The GridDef, corrected
- **Persistence key:** the client GridDef gets an explicit `id`, which replaces `def.table` in the column persistence key (`react/query-grid-provider.tsx:112`).
- **What the client def drops:** the client def carries no `table`, `shapes` or `counterTable`. What the client needs from shapes arrives as **capabilities**.
- **One field description type** (Q2) drives both the grid and the filters: key, label, type, operators, options, lookup, width, pinned, hidden, wrap, nullable. The React-free part is the contract type. The client type extends it with `cell` (ReactNode), so the server never sees React.
  - The host declares its fields once, in a React-free module.
  - The server def is those fields plus storage.
  - The client def is those fields plus cells.
  - Both import the same fields module, so their keys and types can't drift.

### Capability contract
It must cover every use the review found, not just two:
- the provider's URL guard (`react/query-grid-provider.tsx:95`)
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

- **Where it comes from:**
  - On the server, `capabilities(shapes)` in the postgres package, a browser-safe export the host passes to the provider.
  - In memory mode, the memory adapter derives it from field operators plus a `quick` field list (`model/shapes.ts:78–92`).
- **What stays out:** `quickComplete` stays in the store (`model/query-store.ts:55`). Reason codes are derived by the constrained layer, not carried in capabilities (Q8). `explainUnavailable` uses only the query, the target and the rules.

### `@kikstart/query-grid-postgres` (server; no React, no pg)
- **Its own copy of the query contract**, duplicated on purpose: QueryState, the field types, `decodeQuery`, the wire types, `validateQueryValues`, `KEY_FIELD`, `QUICK_MIN_LENGTH`/`QUICK_MAX_LENGTH`, `PAGE_LIMIT_MAX`, `COUNT_CAP`, `QUICK_LIMIT` and `formatCount`.
- **Storage:** storage config (table, shapes, counterTable), `validateGridDef`, the shape helpers (`matchShape`, `shapeId`, `describeShape`, `listOrderedShapes`, the `OrderedShape`/`QuickShape`/`QueryShape` types), shapes → capabilities, refusal (`assertDeclared`, `QueryRejected`), the SQL builder, the runner, the keyset cursor and the migration/index generator.
- **The root package stops exporting the storage types and functions listed above.**
- **`createGridHandler({ def, execute, options?, moves? })`** turns a fetch-standard Request into a Response. It implements the server half of the protocol the HTTP client already speaks (`model/data-source.ts:63–100`):
  - **Routes:** `GET {base}?…&limit`, `/count[?exact=1]`, `/total`, `/facets`, `/options`, `/transitions` and `POST /status`.
  - **Built in:** page, count, total, facets.
  - **Status codes:** a refusal is a 400, a refused transition a 409, and any other error a 500.
  - **Headers:** `no-store` and `server-timing`.
  - **Host hooks:** `options` and `moves` (`{ transitions, change(id, to) }`). An omitted hook answers 404.
  - **Rules:**
    - It parses and validates `limit`: a non-numeric value is a 400, never `LIMIT NaN`.
    - It keeps the `{ error, message }` body, adding `code` and `params`.
    - `/facets` keeps ignoring the query, because facet counts are whole-table counts from the counter table.
  - **Demo:** the demo's 7 route files and `respond()` (`apps/demo/src/lib/api-response.ts`) collapse into one catch-all route.

## Localization (required)
- **One `QueryGridMessagesProvider`** (Q6) with English defaults built in. Base components and bound wrappers both read it through `useMessages()`, which merges the provider's messages over the defaults. With no provider, a component renders English. The query provider has no `messages` prop. Only English ships.
- **Plurals:** `Intl.PluralRules` replaces the English plural ternaries (`model/format.ts:47`, `:55`).
- **Codes, not English, on the wire and in the model.** The client renders them through messages. This covers:
  - refusal reasons (`model/query-actions.ts:197–216`, `QUICK_UNORDERED_REASON` at `:35–36`, `describeQuery` at `:176–189`)
  - `TotalUnavailable.reason` (`server/query-runner.ts:161`, `:182`; `model/memory-source.ts:196`)
  - `QueryRejected` messages
  - `listFilterChips`
- **UI strings:** every visible string and aria-label in the components comes from messages, including `ui/count-display.tsx:62`, `:89` and `:112–113`.
- **Locale:** it keeps flowing through `def.format.locale`.
- **RTL works:**
  - logical properties in `styles.css` (`:326`, `:403`, `:476`, `:496`)
  - `insetInlineStart` in place of inline `left` (data-grid, grid-header, card-list, status-board)
  - direction-aware column resize (`ui/grid-header.tsx:240`) and drag (`:338`)
  - FilterSidebar `side: "start" | "end"`
  - checked on the demo with `dir="rtl"`

## Tests that must exist after the split
- **Cross-package round trip:** client `encodeQuery` → postgres `decodeQuery`, and validation parity between the two copies.
- **Reachable states:** the demo's reachable-states × `matchShape` invariant test (`apps/demo/src/core/orders/orders-grid-def.test.ts`) stays, pointed at `capabilities(shapes)`.
- **SQL builder:** `server/sql-builder.test.ts` gets its own fixtures in the postgres package. `model/query-model.test.ts` splits into a shape part and an action part.
- **Carried over:** every existing unit, DB and benchmark test is carried over.

## Release
- **Versions:** both packages go to 0.2.0 together. It's a breaking change.
- **Docs and demo:** the demo and the README migrate in the same release: Quick start, "Using the hooks alone", "The in-memory data source", "Design as built", "Releasing" and the exports.
- **Build:** build and prepack scripts (`scripts/build.ts`, `copy-docs.ts`) exist per package.
- **Publishing:** prepare it only; Glen publishes both packages.

## Deferred
- a separate components npm package
- a migration CLI (the demo keeps `db/generate-migration.ts`)
- generic status moves on the server beyond the `moves` hook
- a separate memory adapter package

## Scale
This is library code with nothing that grows with a tenant count. Each request is one query against a declared shape's index. The benchmark already proves 72 of 72 shapes on 620k rows. Capabilities are computed once per def, and the handler does no per-request work beyond the one query.
