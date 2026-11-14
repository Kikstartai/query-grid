# query-grid

A bun workspace. `packages/query-grid` is the published library `@kikstart/query-grid`; `apps/demo` is the Next.js demo site. The README holds the design, the decisions and the verification record.

## Commands

Run from the repo root. Each one builds the package first, because the demo consumes its `dist`.

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

- The library has no domain names. A host passes its `GridDef` in; nothing in `packages/query-grid` imports one.
- `./ui` is built entirely on UI SDK components and behaviours. No hand-written primitives, no native `<select>` or date input, no Tailwind, no table library.
- Never read a mutable UI SDK object (`virtual.size()`, `virtual.items()`, `handle.state`) directly in render. Read it through `useSyncExternalStore` or a part's `state` / `children` function: the React Compiler caches the read on the stable object.
- Grid cells render as plain elements under a row part, never one `usePart` per cell.
- UI SDK components take their look from `@ui-sdk/core/web.css` and its `--ui-*` tokens; the app imports it once, before the package's CSS. `packages/query-grid/src/ui/styles.css` styles only the package's own elements (`qg-` classes), reads the same `--ui-*` tokens, defines none of its own, and keeps every selector inside `:where()`. Never restyle the look of a UI SDK component there. Layout the grid cannot work without stays inline.
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
