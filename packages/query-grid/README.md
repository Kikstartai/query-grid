# @kikstart/query-grid

The core of [query-grid](https://github.com/Kikstartai/query-grid): a composable filter and data grid for very large tables that only offers the filter and sort combinations an index answers. This package is the query contract and the state around it. It has no dependencies and imports no React, no DOM global and no `pg`.

```bash
npm install @kikstart/query-grid
```

| Entry point                   | Holds                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@kikstart/query-grid`        | Field and query types, `RunnableQueries`, indexes, `indexRunnable` and `planQuery`, the URL codec, validation, reserved values, exclusion and date presets, actions and offers, the stores, the row feed, the board and the grouping, chips, formatting, `GridLimits`, problem codes, the wire result types |
| `@kikstart/query-grid/http`   | `createHttpSource`, and the protocol it shares with `createGridHandler`: the route names, the query parameters and the error and move bodies                                                                                                                                                                |
| `@kikstart/query-grid/memory` | `createMemorySource` and `memoryRunnable`, for rows already in the browser                                                                                                                                                                                                                                  |

Declare the fields once, then hold a query and follow its rows:

```ts
import {
  createFeed,
  createQueryStore,
  defaultQuery,
  type IndexedGridDef,
} from "@kikstart/query-grid";
import { createHttpSource } from "@kikstart/query-grid/http";

const ORDERS: IndexedGridDef = {
  id: "orders",
  defaultSort: { field: "created_at", direction: "desc" },
  fields: [
    { key: "id", label: "ID", type: "id" },
    {
      key: "created_at",
      label: "Created",
      type: "datetime",
    },
    {
      key: "status",
      label: "Status",
      type: "enum",
      options: STATUSES,
    },
  ],
  indexes: [
    { equals: [], sort: "created_at", range: true },
    { equals: ["status"], sort: "created_at" },
  ],
};

const source = createHttpSource(ORDERS, "/api/orders");
const store = createQueryStore(ORDERS, source.runnable, defaultQuery(ORDERS));
const feed = createFeed(store, source, 100);

store.dispatch({
  type: "setEquals",
  field: "status",
  values: ["open", "paid"],
});
```

- **One query contract.** `encodeQuery` and `decodeQuery` are the only codec: the page URL, the request to the server and the server's parser all use them, and `validateQueryValues` checks a query on both sides.
- **Indexes.** An `IndexDef` is the unit a data layer answers: a set of equality fields and a sort. `getIndex` decides whether an ordered query is declared, `isQueryIndexed` also covers the search, which comes from the def's `search`, and `indexRunnable(indexes, { facetField, searchFields })` turns the same indexes into the `RunnableQueries` the client reads, so the controls and the server cannot disagree. `createHttpSource(def, basePath)` reads them from the def.
- **Defs are layers.** `BaseGridDef` and `BaseFieldDef` are what core reads. The React package adds `cell` (`GridDef`, `FieldDef`) and the Postgres package adds storage (`PostgresGridDef`), so a host writes one object per grid and each package reads its slice.
- **Allowed filters come from the data.** A field def carries no operators. `runnable.equalsFields` and `rangeFields` are what an index names on a server grid and every field on an in-memory one, and `resolveFilterKind(field, runnable)` says which control a field gets.
- **Offers.** `listOffers(def, query, context)` says which filters, sorts and combinations the data source can answer from here, and `explainUnavailable` gives the reason code for one it cannot. A store applies an action only when the result is a query the source can answer.
- **Empty, exclude and presets.** A nullable field takes `EMPTY_VALUE` and `NOT_EMPTY_VALUE` in its equality filter. A field with a fixed list of values takes `!value` to leave one out, and a date range takes a preset name in place of its bounds. The last two are intent: the query and the URL keep them, and `resolveQuery` turns them into plain values and bounds when the query runs. `withQueryResolution` does that around any data source, and both built-in sources are wrapped.
- **The narrowed set.** `planQuery(indexes, query)` splits a query into the core an index answers and the parts that run over that core's rows: `contains`, a range no index bounds and `match: "any"`. A server answers those only when the core leaves at most `narrowLimit` rows, and `createNarrowedStore` feeds that size to the offers, so a control that needs a smaller set is held with the size as its reason.
- **Grouping.** `query.group` names a field. `createGrouping(def, source, query)` loads the group headers, then one keyset feed per group a reader opens; a collapsed group loads nothing.
- **Limits.** `GridLimits` (`pageLimit`, `countCap`, `searchLimit`, `searchBudgetMs`, `narrowLimit`) with `DEFAULT_LIMITS` and `resolveLimits`. A server sets them; the browser holds no copy and reads them through `source.fetchLimits`.
- **Stores.** `createQueryStore`, `createFeed` and the count, total, facet and label stores are plain objects with `subscribe` and a getter, ready for `useSyncExternalStore` or any other reader. `createBoard(def, source, getLaneQueries(…))` is the status board's model: one feed per lane, the transitions loaded once per source, and `move`.
- **Data sources.** `DataSource` is the contract; `createHttpSource` talks to a server that runs [`@kikstart/query-grid-postgres`](https://www.npmjs.com/package/@kikstart/query-grid-postgres), and `createMemorySource` answers from an array.
- **Codes, never sentences.** Problems and reasons are codes with params; the words are the UI's, in [`@kikstart/query-grid-react`](https://www.npmjs.com/package/@kikstart/query-grid-react).

The full documentation, the design, the benchmarks and the verification record are in the [repository README](https://github.com/Kikstartai/query-grid#readme). The three packages, `@kikstart/query-grid`, `@kikstart/query-grid-react` and `@kikstart/query-grid-postgres`, are released together at the same version.

MIT licensed.
