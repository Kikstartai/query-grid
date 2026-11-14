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

| Entry point                             | Holds                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@kikstart/query-grid-react/components` | Controlled base components: `DataGrid`, `FilterBar`, `SortControl`, `QuickFilter`, `FieldFilter`, `FilterChips`, `FilterSidebar`, `FacetPanel`, `CardList`, `StatusBoard`, `ViewSwitch`, `ColumnsMenu`, `CountDisplay`, `TotalFooter`. Props in, callbacks out; no provider and no query. Also `QueryGridMessagesProvider` and `useMessages` |
| `@kikstart/query-grid-react`            | `QueryGridProvider`, its hooks, `useOfferState`, and `ClientFieldDef`, which adds `cell` to core's field type                                                                                                                                                                                                                                |
| `@kikstart/query-grid-react/ui`         | One bound wrapper per base component, under the same name. It reads the provider and renders the base component                                                                                                                                                                                                                              |
| `@kikstart/query-grid-react/styles.css` | The stylesheet for the package's own elements, on UI SDK's `--ui-*` tokens                                                                                                                                                                                                                                                                   |

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
import { QueryGridProvider } from "@kikstart/query-grid-react";
import { DataGrid, FilterBar } from "@kikstart/query-grid-react/ui";

<QueryGridProvider
  def={ORDERS_GRID}
  basePath="/api/orders"
  capabilities={ORDERS_CAPABILITIES}
>
  <FilterBar />
  <DataGrid />
</QueryGridProvider>;
```

Every string comes from `QueryGridMessagesProvider`, with English built in, and the components follow the page's direction, right to left included.

The full documentation, the design and the verification record are in the [repository README](https://github.com/Kikstartai/query-grid#readme). The three packages, `@kikstart/query-grid`, `@kikstart/query-grid-react` and `@kikstart/query-grid-postgres`, are released together at the same version.

MIT licensed.
