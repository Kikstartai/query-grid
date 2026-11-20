# @kikstart/query-grid

The core of [query-grid](https://github.com/Kikstartai/query-grid): a composable filter and data grid for very large tables that only offers the filter and sort combinations an index answers. This package is the query contract and the state around it. It has no dependencies and imports no React, no DOM global and no `pg`.

```bash
npm install @kikstart/query-grid
```

| Entry point                   | Holds                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@kikstart/query-grid`        | Field and query types, `DataSourceCapabilities`, indexes, `indexCapabilities` and `planQuery`, the URL codec, validation, reserved values, exclusion and date presets, actions and offers, the stores, the row feed, the board and the grouping, chips, formatting, `GridLimits`, problem codes, the wire result types |
| `@kikstart/query-grid/http`   | `createHttpSource`, and the protocol it shares with `createGridHandler`: the route names, the query parameters and the error and move bodies                                                                                                                                                                           |
| `@kikstart/query-grid/memory` | `createMemorySource` and `memoryCapabilities`, for rows already in the browser                                                                                                                                                                                                                                         |

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
const store = createQueryStore(
  ORDERS,
  source.capabilities,
  defaultQuery(ORDERS),
);
const feed = createFeed(store, source, 100);

store.dispatch({
  type: "setFilter",
  filter: { field: "status", op: "any_of", values: ["open", "paid"] },
});
```

- **One query contract.** `encodeQuery` and `decodeQuery` are the only codec: the page URL, the request to the server and the server's parser all use them, and `validateQueryValues` checks a query on both sides.
- **Indexes.** An `IndexDef` is the unit a data layer answers: a set of equality fields and a sort. `getIndex` decides whether an ordered query is declared, `isQueryIndexed` also covers the search, which comes from the def's `search`, and `indexCapabilities(indexes, { facetField, searchFields })` turns the same indexes into the `DataSourceCapabilities` the client reads, so the controls and the server cannot disagree. `createHttpSource(def, basePath)` reads them from the def.
- **Defs are layers.** `BaseGridDef` and `BaseFieldDef` are what core reads. The React package adds `cell` (`GridDef`, `FieldDef`) and the Postgres package adds storage (`PostgresGridDef`), so a host writes one object per grid and each package reads its slice.
- **One operator table.** A filter is `{ field, op, … }` in `QueryState.filters`, and `op` is a key of `OPERATORS`: `equals`, `not_equals`, `contains`, `not_contains`, `starts_with`, `ends_with`, `greater_than`, `greater_or_equal`, `less_than`, `less_or_equal`, `between`, `not_between`, `in_period`, `any_of`, `none_of`, `all_of`, `blank`, `not_blank`. Each has a value shape (one value, a pair, a list with `null` for blank, a preset, or none) and the field kinds it applies to; `listFieldOps(field)` gives what a field can take.
- **Allowed filters come from the data.** A field def carries no operators. `capabilities.filterOps` names, per field, the operators some index or the narrowed set answers on a server grid, and every operator of the field's kind on an in-memory one.
- **Offers.** `listOffers(def, query, context)` says, per field and operator, which filters the data source can answer from here, and which sorts and combinations, and `explainUnavailable` gives the reason code for one it cannot. A store applies an action only when the result is a query the source can answer.
- **Intent.** `in_period` and `none_of` on a field with a fixed list of values are intent: the query and the URL keep them, and `toLiteralQuery` turns them into `between` and `any_of` the rest when the query runs. `withLiteralFilters` does that around any data source, and both built-in sources are wrapped; a server refuses both as `literal_required`.
- **The URL.** `f.<field>.<op>=<value>`, repeated per list value, `_empty` for blank in a list, `min..max` for a pair. `convertFilter` keeps what it can of a value when a control changes operator, and `toFilterBounds` reads a comparison as bounds (a day on a datetime is the whole day).
- **Field types.** `id`, `text`, `enum`, `integer`, `decimal`, `money`, `boolean`, `date`, `datetime` and `array`. A row value is a `GridValue`.
- **Scopes.** `withScope(source, scope)` ANDs a `QueryScope` into every read of a data source and keeps it out of the query, the URL and the chips.
- **The narrowed set.** `planQuery(indexes, query, extras)` splits a query into the core an index answers and the parts that run over that core's rows: a negation, a text or array filter with no index of its own, `blank` on a field no index holds, a range no index bounds and `combine: "or"`. A text or array filter on a field in `textIndexes` or `arrayIndexes` stays in the core, and the plan is `budgeted`. A server answers those only when the core leaves at most `narrowLimit` rows, and `createNarrowedStore` feeds that size to the offers, so a control that needs a smaller set is held with the size as its reason.
- **Grouping.** `query.group` names a field. `createGrouping(def, source, query)` loads the group headers, then one keyset feed per group a reader opens; a collapsed group loads nothing.
- **Sort columns.** `QueryState.sort` is the first sort column and `thenBy` up to two more. An index declares a composite order with `then`; `capabilities.thenByFields` and `sortOrders` say what a further column may be, `Offers.thenBy` what may be added now, and `sortRows` orders rows in memory the same way.
- **Export.** `source.fetchExport(query, { columns })` returns the whole filtered result as CSV. `encodeCsv`, `formatExportValue` and `listExportFields` are its pieces, and a text cell that starts like a formula is neutralised.
- **Reorder.** A def with an `orderField` has a manual order. `explainReorder` says when it may change, `resolveRowMove` turns two orders into one move and `source.reorderRow(move)` saves it.
- **Stored defs.** `normalizeStoredGridDef(input, { fields })` turns a def read from a database into one built only from known keys and allowed columns, or a list of problem codes.
- **Limits.** `GridLimits` (`pageLimit`, `countCap`, `searchLimit`, `searchBudgetMs`, `narrowLimit`, `exportLimit`) with `DEFAULT_LIMITS` and `resolveLimits`. A server sets them; the browser holds no copy and reads them through `source.fetchLimits`.
- **Stores.** `createQueryStore`, `createFeed` and the count, total, facet and label stores are plain objects with `subscribe` and a getter, ready for `useSyncExternalStore` or any other reader. `createBoard(def, source, getLaneQueries(…))` is the status board's model: one feed per lane, the transitions loaded once per source, and `move`.
- **Data sources.** `DataSource` is the contract; `createHttpSource` talks to a server that runs [`@kikstart/query-grid-postgres`](https://www.npmjs.com/package/@kikstart/query-grid-postgres), and `createMemorySource` answers from an array.
- **Codes, never sentences.** Problems and reasons are codes with params; the words are the UI's, in [`@kikstart/query-grid-react`](https://www.npmjs.com/package/@kikstart/query-grid-react).

The full documentation, the design, the benchmarks and the verification record are in the [repository README](https://github.com/Kikstartai/query-grid#readme). The three packages, `@kikstart/query-grid`, `@kikstart/query-grid-react` and `@kikstart/query-grid-postgres`, are released together at the same version.

MIT licensed.
