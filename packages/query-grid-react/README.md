# @kikstart/query-grid-react

React components for [query-grid](https://github.com/Kikstartai/query-grid), built on [UI SDK](https://ui-sdk.dev): a composable filter and data grid for very large Postgres tables that only offers the filter and sort combinations an index answers.

```bash
npm install @kikstart/query-grid @kikstart/query-grid-react @ui-sdk/core@beta @ui-sdk/react@beta nuqs
```

React 19, UI SDK `0.1.0-beta.1` or later and nuqs 2.10 or later are peer dependencies. The provider keeps the query in the URL through nuqs, so mount a nuqs adapter above it (`nuqs/adapters/next/app`, `nuqs/adapters/react`, or your router's); the base components need none. Import UI SDK's stylesheet first, then this package's:

```ts
import "@ui-sdk/core/web.css";
import "@kikstart/query-grid-react/styles.css";
```

| Entry point                             | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@kikstart/query-grid-react/components` | Controlled base components: `DataGrid` (and its parts), `FilterBar`, `SortControl`, `SearchFilter`, `EqualsSelect`, `LookupFilter`, `RangeFilter`, `TextFilter`, `MatchToggle`, `GroupControl`, `FilterChips`, `FilterSidebar`, `FacetPanel`, `CardList`, `StatusBoard`, `ViewSwitch`, `ColumnsMenu`, `CountDisplay`, `TotalFooter`. Props in, callbacks out; no provider and no query. Also `QueryGridMessagesProvider` (`messages`, `locale`, `currency`), `useMessages`, `useLocale`, `useCurrency`, the column-state API, and `FieldDef` and `GridDef`, which add `cell` to core's `BaseFieldDef` |
| `@kikstart/query-grid-react`            | `QueryGridProvider`, `StaticQueryGridProvider`, the read hooks, `useOfferState` and `useQueryGridActions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@kikstart/query-grid-react/ui`         | One bound wrapper per base component, under the same name, plus the def-driven `FieldFilter`. It reads the provider and renders the base component                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@kikstart/query-grid-react/styles.css` | The stylesheet for the package's own elements, on UI SDK's `--ui-*` tokens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

A base component alone:

```tsx
import { DataGrid } from "@kikstart/query-grid-react/components";

<DataGrid
  fields={fields}
  rows={rows}
  hasNext={hasNext}
  onEndReached={loadMore}
  loading={loading}
/>;
```

The bound grid, over a server that runs [`@kikstart/query-grid-postgres`](https://www.npmjs.com/package/@kikstart/query-grid-postgres):

```tsx
import { createHttpSource } from "@kikstart/query-grid/http";
import { QueryGridProvider } from "@kikstart/query-grid-react";
import { DataGrid, FilterBar } from "@kikstart/query-grid-react/ui";

const source = createHttpSource(ORDERS_GRID_DEF, "/api/orders");

<QueryGridProvider def={ORDERS_GRID_DEF} source={source}>
  <FilterBar />
  <DataGrid />
</QueryGridProvider>;
```

The provider always takes a `source`; the HTTP one reads its capabilities from the def's indexes. It keeps the query in the URL through [nuqs](https://nuqs.dev), so mount its adapter for your framework; `StaticQueryGridProvider` takes a `queryString`, leaves the URL alone and needs no adapter. Two grids on one page each take a `urlPrefix`, which puts their keys under `a.f.status` and `b.f.status`.

The bound `FilterBar` and `FilterSidebar` take `fields`, the keys of the filters to show and their order; without it they show every filterable field, and `children` replaces the lot. `DataGrid` is a compound on both sides: `<DataGrid />` is the default composition of `DataGrid.Root`, `.Toolbar`, `.Status`, `.ColumnsMenu` and `.Body`, and a host that wants a different toolbar composes the parts itself. `useQueryGridActions()` gives the changes a host's own control makes: `dispatch`, `loadMore`, `requestExact`, `setView`, `rememberLabel`, `loadOptions` and `moveRow`.

The filters cover more than equality: `(empty)` and `(not empty)` on a nullable field, an Exclude toggle on a field with a fixed list of values, date presets from Today to This year, an operator on every range (more than, not between, on a day, before, after), a text filter with contains, does not contain, starts with, ends with and is not, an overlap on an array field, a Match all / Match any toggle and a Group control. On a server grid a filter no index answers runs only over a narrowed set, so it is held with the size of the set as its reason until the indexed filters leave few enough rows. A provider's `scope` ANDs filters the user never sees into every read. A grouped `DataGrid` mixes group headers and a load-more row per open group into the same virtual list; the base component takes them as `groups`.

The grid sorts by several columns (Shift+click a header adds one, and a sort the data cannot answer is disabled with its reason), selects rows for a host's bulk actions through `useRowSelection` and `DataGrid.Selection`, with everything matching as the query and never as ids, opens a row through `rowHref` or `onRowOpen`, shows a UI SDK Menu of `rowActions` per row, and reorders a manually ordered list by drag or keyboard through `onRowReorder`. `ExportButton` downloads the whole filtered result as CSV. A field with no `cell` renders a badge or a list from `render`, and `BadgeCell`, `ListCell`, `LinkCell` and `createLinkCell` are there for a `cell` of your own.

Every string comes from `QueryGridMessagesProvider`, with English built in, and the components follow the page's direction, right to left included.

The full documentation, the design and the verification record are in the [repository README](https://github.com/Kikstartai/query-grid#readme). The three packages, `@kikstart/query-grid`, `@kikstart/query-grid-react` and `@kikstart/query-grid-postgres`, are released together at the same version.

MIT licensed.
