# @kikstart/query-grid-postgres

The Postgres server half of [query-grid](https://github.com/Kikstartai/query-grid): a filter and data grid for very large tables that only offers the filter and sort combinations an index answers, and refuses the rest here.

```bash
npm install @kikstart/query-grid @kikstart/query-grid-postgres
```

It depends on `@kikstart/query-grid` for the query contract and the index types, and on nothing else: no React, and no `pg`. You pass it one function that runs SQL.

```ts
import {
  createGridHandler,
  generateGridMigration,
  type PostgresGridDef,
  type SqlExecutor,
} from "@kikstart/query-grid-postgres";

const ORDERS: PostgresGridDef = {
  id: "orders",
  table: "orders",
  fields: ORDER_FIELDS,
  defaultSort: { field: "created_at", direction: "desc" },
  indexes: [
    { equals: [], sort: "created_at", range: true },
    { equals: ["status_code"], sort: "created_at", range: true },
  ],
  quick: ["customer_name", "order_number"],
  facet: { field: "status_code", counterTable: "order_status_counts" },
};

const execute: SqlExecutor = async (sql) =>
  (await pool.query(sql.text, sql.values)).rows;

const handle = createGridHandler({
  def: ORDERS,
  execute,
  basePath: "/api/orders",
});

export const GET = (request: Request) => handle(request);
export const POST = (request: Request) => handle(request);
```

- **`createGridHandler({ def, execute, basePath?, options?, moves?, onError? })`** turns a fetch-standard `Request` into a `Response`. It answers the page, `/count`, `/total` and `/facets` itself, and `/options`, `/transitions` and `POST /status` through the `options` and `moves` hooks; an omitted hook is a 404. A refusal is a 400, a refused transition a 409, anything else a 500. Every read gets `request.signal` as the third argument of `execute` and of the `options` and `transitions` hooks, so the host can cancel the statement of a dropped request; an aborted request is a 499 and is not passed to `onError`. Error bodies are `{ error, message, code, params }`: codes, never sentences.
- **Indexes.** An index is one index: a set of equality fields, a sort, optionally a range on the sort; the def's `quick` columns get one more index, a trigram GIN. The `IndexDef` type, `getIndex` and the other index helpers come from core; here `validateGridDef` checks a def against Postgres's rules, and `generateGridMigration` writes one index per index plus the counter table and its triggers. `listMissingIndexes` compares the def with `pg_indexes`.
- **Capabilities** are core's: `createHttpSource(def, basePath)` builds them from the def's indexes, so the client offers what this server accepts.
- **One def per grid.** `PostgresGridDef` is core's `BaseGridDef` plus `table`, `indexes` and `facet.counterTable`. A host's grid def can also carry React `cell`s for the React package; this package ignores them.
- **Several values of one field** are one array parameter under `= ANY`, capped per field by `maxValues`. An index opts out with `multi: false`.
- **The runner** (`listGridPage`, `getGridCount`, `listGridTotals`, `listFacetCounts`, `walkGridPages`) and the SQL builder are exported for a host that wants its own routes.

The full documentation, the design, the benchmarks and the verification record are in the [repository README](https://github.com/Kikstartai/query-grid#readme). The three packages, `@kikstart/query-grid`, `@kikstart/query-grid-react` and `@kikstart/query-grid-postgres`, are released together at the same version.

MIT licensed.
