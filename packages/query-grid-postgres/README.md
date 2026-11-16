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
  search: ["customer_name", "order_number"],
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

- **`createGridHandler({ def, execute, basePath?, limits?, options?, moves?, onError? })`** turns a fetch-standard `Request` into a `Response`. It answers the page, `/count`, `/total`, `/facets`, `/groups`, `/narrowed` and `/limits` itself, and `/options`, `/transitions` and `POST /status` through the `options` and `moves` hooks; an omitted hook is a 404. A refusal is a 400, a refused transition a 409, anything else a 500. Every read gets `request.signal` as the third argument of `execute` and of the `options` and `transitions` hooks, so the host can cancel the statement of a dropped request; an aborted request is a 499 and is not passed to `onError`. Error bodies are `{ error, message, code, params }`: codes, never sentences.
- **Indexes.** An `IndexDef` is a set of equality fields, a sort, optionally a range on the sort; the def's `search` columns get one more index, a trigram GIN. The `IndexDef` type, `getIndex` and the other index helpers come from core; here `validateGridDef` checks a def against Postgres's rules, and `generateGridMigration` writes one `CREATE INDEX` per `IndexDef` plus the counter table and its triggers. `listMissingIndexes` compares the def with `pg_indexes`.
- **Data source capabilities** are core's: `createHttpSource(def, basePath)` builds them from the def's indexes, so the client offers what this server accepts.
- **One def per grid.** `PostgresGridDef` is core's `BaseGridDef` plus `table`, `indexes` and `facet.counterTable`. A host's grid def can also carry React `cell`s for the React package; this package ignores them.
- **Limits.** `limits` on the handler, or the last argument of a runner function, overrides any of `pageLimit` (200), `countCap` (10,000), `searchLimit` (500), `searchBudgetMs` (120) and `narrowLimit`. Passing nothing keeps the defaults, and a value that is no positive integer throws when the handler is made.
- **Empty values.** On a nullable field `_empty` is `IS NULL` and `_not_empty` is `IS NOT NULL`, on the field's ordinary index. Empty mixes with real values as `(col = ANY($n) OR col IS NULL)`.
- **The search with filters.** An equality filter on any indexed field is one more clause on the search statement, under the same budget and limit. A range beside the search is refused.
- **Text and array indexes.** `textIndexes` and `arrayIndexes` on the def name fields with a trigram or an array GIN index each, and `empty` on an index makes it partial (`WHERE col IS NULL`). A contains, starts-with or ends-with on a text-indexed field and an overlap on an array-indexed one run as the ordinary ordered page under the search budget, and answer `too_broad` past it.
- **Operators.** An open bound is `>` or `<`. An excluded range is its two outer sides ORed, with `IS NULL` on a nullable field. Does not contain is `NOT ILIKE`, is not `IS DISTINCT FROM`, an overlap `&&` with one array parameter. A `boolean`, `date`, `decimal` and `array` field are cast to `boolean`, `date`, `numeric` and `text[]`.
- **The narrowed set.** A text filter or an overlap with no index of its own, an excluded range, a range no index bounds, an OR across fields and a group by a field other than the counted one run only over the rows the indexed filters leave. The runner counts those rows up to `narrowLimit` first and refuses past it with `narrow_first`, then runs with `enable_seqscan = off`. Your executor's statement timeout stays the safety net.
- **Groups.** `/groups` reads the counter table for the counted field, falls back to capped live counts under another filter, and runs one `GROUP BY` over the narrowed rows for any other equality field.
- **Sort columns.** An index with `then` is one btree over the equality columns, the sort, those columns and the key, and a page of that order is one row comparison over the whole sort key. Any other further sort column runs over the narrowed set.
- **Export.** `GET /export` streams the whole filtered result as CSV in keyset pages, refused with `export_too_large` over `exportLimit` (50,000) before the first page is read. `walkExportPages` yields the same bounded pages for a route with its own encoder.
- **Reorder.** `POST /order` validates `{ id, after, before }` and hands it to the `reorder.move` hook, which returns the rows it changed.
- **Several values of one field** are one array parameter under `= ANY`, capped per field by `maxValues`. An index opts out with `multi: false`.
- **The runner** (`listGridPage`, `getGridCount`, `listGridTotals`, `listFacetCounts`, `listGridGroups`, `getNarrowedSizes`, `walkGridPages`) and the SQL builder are exported for a host that wants its own routes.

The full documentation, the design, the benchmarks and the verification record are in the [repository README](https://github.com/Kikstartai/query-grid#readme). The three packages, `@kikstart/query-grid`, `@kikstart/query-grid-react` and `@kikstart/query-grid-postgres`, are released together at the same version.

MIT licensed.
