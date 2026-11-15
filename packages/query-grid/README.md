# @kikstart/query-grid

The core of [query-grid](https://github.com/Kikstartai/query-grid): a composable filter and data grid for very large tables that only offers the filter and sort combinations an index answers. This package is the query contract and the state around it. It has no dependencies and imports no React, no DOM global and no `pg`.

```bash
npm install @kikstart/query-grid
```

| Entry point                   | Holds                                                                                                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@kikstart/query-grid`        | Field and query types, `Capabilities`, query shapes and `shapeCapabilities`, the URL codec, validation, actions and offers, the stores, the row feed and the board, chips, formatting, problem codes, the wire result types |
| `@kikstart/query-grid/http`   | `createHttpSource`, and the protocol it shares with `createGridHandler`: the route names, the query parameters and the error and move bodies                                                                                |
| `@kikstart/query-grid/memory` | `createMemorySource` and `memoryCapabilities`, for rows already in the browser                                                                                                                                              |

Declare the fields once, then hold a query and follow its rows:

```ts
import {
  createFeed,
  createQueryStore,
  defaultQuery,
  type ShapedGridDef,
} from "@kikstart/query-grid";
import { createHttpSource } from "@kikstart/query-grid/http";

const ORDERS: ShapedGridDef = {
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
  shapes: [
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
  type: "setEquals",
  field: "status",
  values: ["open", "paid"],
});
```

- **One query contract.** `encodeQuery` and `decodeQuery` are the only codec: the page URL, the request to the server and the server's parser all use them, and `validateQueryValues` checks a query on both sides.
- **Shapes.** A `QueryShape` is the unit a data layer answers: a set of equality fields and a sort. `matchShape` decides whether an ordered query is declared, `isQueryDeclared` also covers the quick filter, which comes from the def's `quick`, and `shapeCapabilities(shapes, { facetField, quickFields })` turns the same shapes into the `Capabilities` the client reads, so the controls and the server cannot disagree. `createHttpSource(def, basePath)` reads them from the def.
- **Defs are layers.** `BaseGridDef` and `BaseFieldDef` are what core reads. The React package adds `cell` (`GridDef`, `FieldDef`) and the Postgres package adds storage (`PostgresGridDef`), so a host writes one object per grid and each package reads its slice.
- **Allowed filters come from the data.** A field def carries no operators. `capabilities.equalsFields` and `rangeFields` are what a shape names on a server grid and every field on an in-memory one, and `resolveFilterKind(field, capabilities)` says which control a field gets.
- **Offers.** `listOffers(def, query, rules)` says which filters, sorts and combinations the data source can answer from here, and `explainUnavailable` gives the reason code for one it cannot. A store applies an action only when the result is a query the source can answer.
- **Stores.** `createQueryStore`, `createFeed` and the count, total, facet and label stores are plain objects with `subscribe` and a getter, ready for `useSyncExternalStore` or any other reader. `createBoard(def, source, getLaneQueries(…))` is the status board's model: one feed per lane, the transitions loaded once per source, and `move`.
- **Data sources.** `DataSource` is the contract; `createHttpSource` talks to a server that runs [`@kikstart/query-grid-postgres`](https://www.npmjs.com/package/@kikstart/query-grid-postgres), and `createMemorySource` answers from an array.
- **Codes, never sentences.** Problems and reasons are codes with params; the words are the UI's, in [`@kikstart/query-grid-react`](https://www.npmjs.com/package/@kikstart/query-grid-react).

The full documentation, the design, the benchmarks and the verification record are in the [repository README](https://github.com/Kikstartai/query-grid#readme). The three packages, `@kikstart/query-grid`, `@kikstart/query-grid-react` and `@kikstart/query-grid-postgres`, are released together at the same version.

MIT licensed.
