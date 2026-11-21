# query-grid

A bun workspace of three published packages and one demo. The README holds the usage, the decisions, the benchmarks and the verification record; `docs/DESIGN.md` holds the current design.

| Path                           | Package                         | Holds                                                                                                                     |
| ------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `packages/query-grid`          | `@kikstart/query-grid`          | the core: the query contract, indexes and runnable queries, stores, feeds, the board, data sources. No React, DOM or `pg` |
| `packages/query-grid-react`    | `@kikstart/query-grid-react`    | base components (`./components`), provider and hooks (`.`), bound wrappers (`./ui`), `./styles.css`                       |
| `packages/query-grid-postgres` | `@kikstart/query-grid-postgres` | the server: def validation, SQL, DDL, `createGridHandler`. No React or `pg`                                               |
| `apps/demo`                    | `demo`                          | the Next.js demo site                                                                                                     |

## Commands

Run from the repo root. Each one builds the packages first, core then postgres then react, because the others consume their `dist`.

```bash
bun run typecheck
```

```bash
bun run lint
```

```bash
bun run test
```

```bash
bun run dev
```

The demo needs `apps/demo/.env.local` with `QUERY_GRID_DATABASE_URL`. `bun run --filter demo test:db`, `db:bench` and `db:bench:quick` run against that database. `db:bench:quick` is the per-release check, about a minute; the full `db:bench` writes `db/bench-results.md`.

The browser suite is Playwright in `apps/demo/e2e`. It needs `bun run build` first and starts `next start` on port 3040 (`E2E_PORT` picks another) unless a server already listens there. Board moves write to the database, so they run after the read-only tests.

```bash
bun run --filter demo e2e
```

## Checks

| Suite         | Command                                | Needed when                                                                                                  | Rough time |
| ------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------- |
| unit          | `bun run test`                         | every change                                                                                                 | 1 min      |
| typecheck     | `bun run typecheck`                    | every change                                                                                                 | 1 min      |
| lint          | `bun run lint`                         | every change                                                                                                 | 1 min      |
| database      | `bun run --filter demo test:db`        | any change reaching SQL, the planner, defs or `apps/demo/db`; needs `apps/demo/.env.local`                   | 2 min      |
| performance   | `bun run --filter demo db:bench:quick` | SQL, index, planner or schema changes                                                                        | 1 min      |
| build         | `bun run build`                        | before e2e and before a commit                                                                               | 2 min      |
| browser (e2e) | `bun run --filter demo e2e`            | any change the demo renders; needs a build; board moves write to the database; `E2E_PORT` when 3040 is taken | 5 min      |

## UI SDK

Before using ui-sdk, follow the ui-sdk skill if it's installed (`.agents/skills/ui-sdk`), and read `node_modules/@ui-sdk/react/docs/llms.txt`. To build a new component, also search `node_modules/@ui-sdk/react/docs/core.md` by heading and read `rendering.md` next to it.

## Principles

1. The UI reflects what the data layer can do. A filter, sort or combination is offered only when an index answers it fast, and the server refuses any other.
2. Composition, not a monolith. Filtering and the grid are separate parts around one query state.
3. Very large data sets are never a constraint.

## Library rules

- The library has no domain names. A host passes its defs in; nothing in `packages/` imports one.
- Every filter is `{ field, op, … }` with `op` a key of the one `OPERATORS` table in core; a field's kind (from its def) picks the operators it takes. What may be filtered comes from the data alone: the indexes and the narrowed set on a server grid, every operator of the kind on a client grid. A field def carries no operators. Which filters show is a layout prop (`fields` on the bound `FilterBar` and `FilterSidebar`), never part of a def.
- An operation no index answers at any size (an OR across fields, a range the index does not bound, a negation, a text or array filter with no index of its own, blank on a field no index holds, a group by an uncounted field) runs only over a narrowed set: the rows the indexed filters leave, at most `narrowLimit`. `planQuery` in core makes the split, the server counts and refuses before it runs one, and the control is held with the size as its reason, never hidden.
- An index is `{ filter, sort }`, `{ text }` or `{ array }`; each `OPERATORS` entry names the kinds that answer it. A text or an array field may have an index of its own (`{ text: "name" }`, `{ array: "tags" }`). A filter it answers keeps the grid's order and paging and runs under the search budget; beside any narrowed part it joins the narrowed set.
- A scope is a wrapper around a data source (`withScope`), never part of the query, the URL or the chips, and it withdraws Match any.
- Intent the browser alone understands (`none_of` on fixed values, `in_period`) stays in the query and the URL and is turned into literal filters at the data source by `withLiteralFilters`. The server never accepts it.
- Limits are `GridLimits`, set on the server and read by the browser from its responses. No package hard-codes a cap the handler can override.
- One def per grid; each package reads its slice. The types are layers with unique names: core `BaseGridDef` and `BaseFieldDef`, react `GridDef` and `FieldDef` (plus `cell`), postgres `PostgresGridDef` (plus `table`, `indexes`, `facet.counterTable`). A grid def constant ends in `_GRID_DEF`.
- There is one query contract, in core. The other two packages import it and never copy it.
- Core imports no React, no DOM global and no `pg`. The postgres package imports no React and no `pg`.
- Core and the postgres package emit codes and params, never English. Every sentence a user reads comes from `components/messages.tsx`, through `useMessages()`.
- A file under `packages/query-grid-react/src/components` takes props and calls back. It imports no provider hook and knows no query, source, index or URL. The bound wrapper of the same name lives under `src/ui`.
- The React package is built entirely on UI SDK components and behaviours. No hand-written primitives, no native `<select>` or date input, no Tailwind, no table library.
- Never read a mutable UI SDK object (`virtual.size()`, `virtual.items()`, `handle.state`) directly in render. Read it through `useSyncExternalStore` or a part's `state` / `children` function: the React Compiler caches the read on the stable object.
- Grid cells render as plain elements under a row part, never one `usePart` per cell.
- UI SDK components take their look from `@ui-sdk/core/web.css` and its `--ui-*` tokens; the app imports it once, before the package's CSS. `packages/query-grid-react/src/styles.css` styles only the package's own elements (`qg-` classes), reads the same `--ui-*` tokens, defines none of its own, keeps every selector inside `:where()` and uses logical properties only. Never restyle the look of a UI SDK component there. Layout the grid cannot work without stays inline, on `insetInlineStart` and never `left`.
- A message, a count or a formatted value a component renders goes inside `<bdi>`, so it keeps its own order in a right-to-left page.
- Relative imports carry their `.ts` / `.tsx` extension; the build rewrites them.

## Demo

- Verify runtime changes with `/verify`, following `.claude/skills/verify`.
- Never force a subtree dynamic to satisfy the framework (`connection()`, `noStore`, `force-dynamic`, an `AtRequest`-style wrapper). A page renders static unless it reads real request data, and if a build complains, fix the cause, not the symptom.

## House style

- Brace every control-flow body (`if`, `else`, `for`, `while`), even single statements.
- An object shape is an `interface`; `type` only for unions, intersections, mapped, conditional, tuple or function types.
- No nested conditionals in JSX, and no local `render*` closures or JSX parked in variables. Render states are early returns from a component, one condition per guard; a section with its own states is its own component.
- Zero comments by default. Only a single-sentence comment where the why is a non-obvious trap. No JSDoc restating signatures.
- The React Compiler is on: no `useMemo`, `useCallback` or `React.memo`.
- Read-function naming: `list*` returns a collection, never null; `get*` returns one item or null. `resolve*` picks one answer from several by a fixed order; `normalize*` guards and shapes one input.
- Never call `.then` or `.catch` on a promise during render. The one exception is a page mapping its `params` promise to a feature component (`params.then(({ part }) => …)`), so the feature takes an id and not a route prop.

## Commits

Single-line subjects, one coherent milestone per commit, explicit file paths. Format only the files you touched, with `bun x prettier --write <paths>`; prettier is pinned in the root `package.json`.
