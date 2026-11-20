import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CSV_BOM,
  SourceError,
  type BaseGridDef,
  type DataSource,
  type GridRow,
} from "@kikstart/query-grid";
import { createMemorySource } from "@kikstart/query-grid/memory";

import { NO_PERSISTENCE } from "../components/column-state.ts";
import {
  useQueryGridActions,
  useQueryGridState,
  type QueryGridActions,
  type QueryGridState,
} from "./query-grid-context.tsx";
import {
  useReorderOffer,
  useRowSelection,
  type ReorderOffer,
  type RowSelection,
} from "./query-grid-hooks.ts";
import { StaticQueryGridProvider } from "./query-grid-provider.tsx";

const DEF: BaseGridDef = {
  id: "stages",
  defaultSort: { field: "position", direction: "asc" },
  orderField: "position",
  fields: [
    { key: "id", label: "ID", type: "id", hidden: true },
    { key: "name", label: "Name", type: "text" },
    { key: "position", label: "Order", type: "integer" },
    {
      key: "kind",
      label: "Kind",
      type: "enum",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    },
  ],
};

function listRows(): GridRow[] {
  return ["one", "two", "three", "four"].map((name, at) => ({
    id: name,
    name,
    position: at + 1,
    kind: at % 2 === 0 ? "a" : "b",
  }));
}

interface Mounted {
  actions: QueryGridActions;
  state: QueryGridState;
}

function mount(
  source: DataSource,
  queryString = "",
  child: ReactElement | null = null,
): Mounted & { html: string } {
  const captured: Mounted[] = [];
  function Capture() {
    captured.push({
      actions: useQueryGridActions(),
      state: useQueryGridState(),
    });
    return null;
  }
  const html = renderToStaticMarkup(
    <StaticQueryGridProvider
      def={DEF}
      source={source}
      scope={{ filters: [] }}
      queryString={queryString}
      columnPersistence={NO_PERSISTENCE}
    >
      <Capture />
      {child}
    </StaticQueryGridProvider>,
  );
  return { ...captured[0], html };
}

async function loadFeed(state: QueryGridState): Promise<void> {
  state.feed.subscribe(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const names = (state: QueryGridState) =>
  state.feed.getState().rows.map((row) => row.name);

describe("reorderRow", () => {
  const move = { id: "four", index: 1, after: "one", before: "two" };

  test("moves the row at once, saves it and takes the source's new order values", async () => {
    const { actions, state } = mount(createMemorySource(DEF, listRows()));
    await loadFeed(state);
    const saving = actions.reorderRow(move);
    expect(names(state)).toEqual(["one", "four", "two", "three"]);
    await saving;
    expect(state.feed.getState().rows.map((row) => row.position)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  test("a save that fails reloads the rows and rejects with the source's code", async () => {
    const source: DataSource = {
      ...createMemorySource(DEF, listRows()),
      reorderRow: async () => {
        throw new SourceError("order_locked");
      },
    };
    const { actions, state } = mount(source);
    await loadFeed(state);
    await expect(actions.reorderRow(move)).rejects.toMatchObject({
      code: "order_locked",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(names(state)).toEqual(["one", "two", "three", "four"]);
  });

  test("two quick moves are saved in the order they were made", async () => {
    const seen: string[] = [];
    const memory = createMemorySource(DEF, listRows());
    const source: DataSource = {
      ...memory,
      reorderRow: async (next) => {
        seen.push(`start ${next.id}`);
        const changed = await memory.reorderRow(next);
        seen.push(`end ${next.id}`);
        return changed;
      },
    };
    const { actions, state } = mount(source);
    await loadFeed(state);
    await Promise.all([
      actions.reorderRow(move),
      actions.reorderRow({ id: "three", index: 0, after: null, before: "one" }),
    ]);
    expect(seen).toEqual([
      "start four",
      "end four",
      "start three",
      "end three",
    ]);
    expect(names(state)).toEqual(["three", "one", "four", "two"]);
  });

  test("a row that is not loaded is no move", async () => {
    const { actions, state } = mount(createMemorySource(DEF, listRows()));
    await loadFeed(state);
    await actions.reorderRow({ ...move, id: "nope" });
    expect(names(state)).toEqual(["one", "two", "three", "four"]);
  });
});

describe("the reorder offer", () => {
  function read(queryString: string, def = DEF): ReorderOffer | null {
    const seen: (ReorderOffer | null)[] = [];
    function Readout() {
      seen.push(useReorderOffer());
      return null;
    }
    renderToStaticMarkup(
      <StaticQueryGridProvider
        def={def}
        source={createMemorySource(def, listRows())}
        queryString={queryString}
        columnPersistence={NO_PERSISTENCE}
      >
        <Readout />
      </StaticQueryGridProvider>,
    );
    return seen[0];
  }

  test("a def with no order field has no reorder at all", () => {
    expect(read("", { ...DEF, orderField: undefined })).toBeNull();
  });

  test("another sort holds it with the reason, in the messages' words", () => {
    expect(read("sort=name.asc")).toEqual({
      offered: false,
      reason: "Sort by Order ascending, and by nothing else, to reorder.",
    });
  });

  test("before the rows are in hand it is held, never offered on a guess", () => {
    expect(read("")).toEqual({
      offered: false,
      reason: "Reordering needs every row loaded: narrow the filters first.",
    });
  });
});

describe("the selection a host reads", () => {
  function read(prepare: (state: QueryGridState) => void): RowSelection {
    const seen: RowSelection[] = [];
    function Prepare() {
      prepare(useQueryGridState());
      return null;
    }
    function Readout() {
      seen.push(useRowSelection());
      return null;
    }
    renderToStaticMarkup(
      <StaticQueryGridProvider
        def={DEF}
        source={createMemorySource(DEF, listRows())}
        scope={{ filters: [{ field: "kind", op: "any_of", values: ["a"] }] }}
        queryString="sort=name.asc"
        columnPersistence={NO_PERSISTENCE}
      >
        <Prepare />
        <Readout />
      </StaticQueryGridProvider>,
    );
    return seen[0];
  }

  test("nothing, then the ids", () => {
    expect(read(() => undefined)).toEqual({ kind: "none" });
    expect(
      read((state) =>
        state.selection.set({ ids: ["one"], allMatching: false, key: 0 }),
      ),
    ).toEqual({ kind: "rows", ids: ["one"] });
  });

  test("everything matching is the user's query and the scope, never the ids", () => {
    const selection = read((state) =>
      state.selection.set({ ids: ["one", "three"], allMatching: true, key: 0 }),
    );
    expect(selection).toMatchObject({
      kind: "matching",
      scope: { filters: [{ field: "kind", op: "any_of", values: ["a"] }] },
      capped: false,
    });
    expect(selection.kind === "matching" && selection.query.sort).toEqual({
      field: "name",
      direction: "asc",
    });
    expect(selection.kind === "matching" && selection.query.filters).toEqual(
      [],
    );
    expect("ids" in selection).toBe(false);
  });

  test("clearSelection empties it and tells the grid to clear", () => {
    const { actions, state } = mount(createMemorySource(DEF, listRows()));
    state.selection.set({ ids: ["one"], allMatching: true, key: 4 });
    actions.clearSelection();
    expect(state.selection.get()).toEqual({
      ids: [],
      allMatching: false,
      key: 5,
    });
  });
});

describe("fetchExport", () => {
  test("is the current query, in the columns asked for", async () => {
    const { actions } = mount(
      createMemorySource(DEF, listRows()),
      "f.kind.any_of=a&sort=position.desc",
    );
    expect(await actions.fetchExport(["name", "position"])).toBe(
      `${CSV_BOM}"Name","Order"\r\n"three",3\r\n"one",1\r\n`,
    );
  });
});
