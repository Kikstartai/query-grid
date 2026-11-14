# query-grid

A bun workspace of three published packages and one demo. The README holds the design, the decisions and the verification record; `docs/RESTRUCTURE.md` holds the 0.2.0 spec and its record.

| Path                           | Package                         | Holds                                                                                               |
| ------------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `packages/query-grid`          | `@kikstart/query-grid`          | the core: the query contract, stores, feeds, data sources. No React, DOM or `pg`                    |
| `packages/query-grid-react`    | `@kikstart/query-grid-react`    | base components (`./components`), provider and hooks (`.`), bound wrappers (`./ui`), `./styles.css` |
| `packages/query-grid-postgres` | `@kikstart/query-grid-postgres` | the server: shapes, SQL, DDL, `createGridHandler`. No React or `pg`                                 |
| `apps/demo`                    | `demo`                          | the Next.js demo site                                                                               |

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

The demo needs `apps/demo/.env.local` with `QUERY_GRID_DATABASE_URL`. `bun run --filter demo test:db` and `db:bench` run against that database.

## UI SDK

Before using ui-sdk, follow the ui-sdk skill if it's installed (`.agents/skills/ui-sdk`), and read `node_modules/@ui-sdk/react/docs/llms.txt`. To build a new component, also search `node_modules/@ui-sdk/react/docs/core.md` by heading and read `rendering.md` next to it.

## Principles

1. The UI reflects what the data layer can do. A filter, sort or combination is offered only when an index answers it fast, and the server refuses any other.
2. Composition, not a monolith. Filtering and the grid are separate parts around one query state.
3. Very large data sets are never a constraint.

## Library rules

- The library has no domain names. A host passes its defs in; nothing in `packages/` imports one.
- There is one query contract, in core. The other two packages import it and never copy it.
- Core imports no React, no DOM global and no `pg`. The postgres package imports no React and no `pg`.
- Core and the postgres package emit codes and params, never English. Every sentence a user reads comes from `components/messages.tsx`, through `useMessages()`.
- A file under `packages/query-grid-react/src/components` takes props and calls back. It imports no provider hook and knows no query, source, shape or URL. The bound wrapper of the same name lives under `src/ui`.
- The React package is built entirely on UI SDK components and behaviours. No hand-written primitives, no native `<select>` or date input, no Tailwind, no table library.
- Never read a mutable UI SDK object (`virtual.size()`, `virtual.items()`, `handle.state`) directly in render. Read it through `useSyncExternalStore` or a part's `state` / `children` function: the React Compiler caches the read on the stable object.
- Grid cells render as plain elements under a row part, never one `usePart` per cell.
- UI SDK components take their look from `@ui-sdk/core/web.css` and its `--ui-*` tokens; the app imports it once, before the package's CSS. `packages/query-grid-react/src/styles.css` styles only the package's own elements (`qg-` classes), reads the same `--ui-*` tokens, defines none of its own, keeps every selector inside `:where()` and uses logical properties only. Never restyle the look of a UI SDK component there. Layout the grid cannot work without stays inline, on `insetInlineStart` and never `left`.
- A message, a count or a formatted value a component renders goes inside `<bdi>`, so it keeps its own order in a right-to-left page.
- Relative imports carry their `.ts` / `.tsx` extension; the build rewrites them.

## House style

- Brace every control-flow body (`if`, `else`, `for`, `while`), even single statements.
- An object shape is an `interface`; `type` only for unions, intersections, mapped, conditional, tuple or function types.
- No nested conditionals in JSX, and no local `render*` closures or JSX parked in variables. Render states are early returns from a component, one condition per guard; a section with its own states is its own component.
- Zero comments by default. Only a single-sentence comment where the why is a non-obvious trap. No JSDoc restating signatures.
- The React Compiler is on: no `useMemo`, `useCallback` or `React.memo`.
- Read-function naming: `list*` returns a collection, never null; `get*` returns one item or null. `resolve*` picks one answer from several by a fixed order; `normalize*` guards and shapes one input.
- Never call `.then` or `.catch` on a promise during render.

## Commits

Single-line subjects, one coherent milestone per commit, explicit file paths. Format only the files you touched.
