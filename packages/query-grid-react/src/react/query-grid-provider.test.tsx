import { describe, expect, test } from "bun:test";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  createBoard,
  createQueryStore,
  defaultQuery,
  getLaneQueries,
  encodeQuery,
  type DataSource,
  type Filter,
  type QueryState,
  type QueryStore,
} from "@kikstart/query-grid";
import { createMemorySource } from "@kikstart/query-grid/memory";

import { NO_PERSISTENCE } from "../components/column-state.ts";
import { TEST_GRID_DEF, TEST_ROWS } from "../components/fields.fixture.ts";
import {
  useQueryGridActions,
  type QueryGridActions,
} from "./query-grid-context.tsx";
import { useGridView, useQueryState } from "./query-grid-hooks.ts";
import {
  QueryGridProvider,
  StaticQueryGridProvider,
} from "./query-grid-provider.tsx";
import {
  buildUrlParsers,
  readUrlState,
  toQueryString,
  toUrlValues,
  type UrlValues,
} from "./url-state.ts";
import { createUrlSync, type UrlSync } from "./url-sync.ts";

const DEF = TEST_GRID_DEF;
const BASE = defaultQuery(DEF);
const source = createMemorySource(DEF, TEST_ROWS);
const CAPABILITIES = source.capabilities;

function statusAnyOf(values: string[]): Filter {
  return { field: "status", op: "any_of", values };
}

function regionAnyOf(values: string[]): Filter {
  return { field: "region", op: "any_of", values };
}

function Readout() {
  const query = useQueryState();
  const view = useGridView();
  return <output>{JSON.stringify({ query, view })}</output>;
}

interface Shown {
  query: QueryState;
  view: string;
}

function readAll(element: ReactElement): Shown[] {
  const html = renderToStaticMarkup(element);
  return [...html.matchAll(/<output>(.*?)<\/output>/g)].map(
    (match) => JSON.parse(match[1].replaceAll("&quot;", '"')) as Shown,
  );
}

function read(element: ReactElement): Shown {
  return readAll(element)[0];
}

function renderAt(search: string) {
  return read(
    <NuqsTestingAdapter searchParams={search}>
      <QueryGridProvider
        def={DEF}
        source={source}
        columnPersistence={NO_PERSISTENCE}
      >
        <Readout />
      </QueryGridProvider>
    </NuqsTestingAdapter>,
  );
}

describe("the URL parsers", () => {
  test("the key map is built from the def at runtime, on core's keys", () => {
    const filterKeys = Object.entries(CAPABILITIES.filterOps).flatMap(
      ([field, ops]) => ops.map((op) => `f.${field}.${op}`),
    );
    expect(Object.keys(buildUrlParsers(CAPABILITIES))).toEqual([
      ...filterKeys,
      "match",
      "group",
      "q",
      "sort",
      "cursor",
      "view",
    ]);
    expect(filterKeys).toContain("f.status.any_of");
    expect(filterKeys).toContain("f.total.between");
    expect(filterKeys).toContain("f.note.blank");
    expect(filterKeys).not.toContain("f.name.blank");
  });

  test("a state written for nuqs is the one core encodes, and reads back", () => {
    const state = {
      query: {
        ...BASE,
        filters: [
          { field: "total", op: "greater_or_equal" as const, value: "100" },
          statusAnyOf(["open", "done"]),
          regionAnyOf(["north"]),
        ],
        sort: { field: "total", direction: "asc" as const },
      },
      view: "list" as const,
    };
    const values = toUrlValues(DEF, CAPABILITIES, state);
    expect(values).toEqual({
      ...Object.fromEntries(
        Object.entries(CAPABILITIES.filterOps).flatMap(([field, ops]) =>
          ops.map((op) => [`f.${field}.${op}`, []]),
        ),
      ),
      "f.status.any_of": ["open", "done"],
      "f.region.any_of": ["north"],
      "f.total.greater_or_equal": ["100"],
      match: null,
      group: null,
      q: null,
      sort: "total.asc",
      cursor: null,
      view: "list",
    });
    const queryString = toQueryString(CAPABILITIES, values);
    const core = encodeQuery(DEF, state.query);
    for (const [name, value] of core) {
      expect(new URLSearchParams(queryString).getAll(name)).toContain(value);
    }
    expect([...new URLSearchParams(queryString)]).toHaveLength(
      [...core].length + 1,
    );
    expect(readUrlState(DEF, source.capabilities, queryString)).toEqual(state);
  });
});

describe("the provider under a nuqs adapter", () => {
  test("it starts from the URL, with several values, a sort and a view", () => {
    expect(
      renderAt(
        "?f.status.any_of=open&f.status.any_of=done&sort=total.asc&view=board",
      ),
    ).toEqual({
      query: {
        ...BASE,
        filters: [statusAnyOf(["open", "done"])],
        sort: { field: "total", direction: "asc" },
      },
      view: "board",
    });
  });

  test("an empty URL is the default query in the grid view", () => {
    expect(renderAt("")).toEqual({ query: BASE, view: "grid" });
  });

  test("a URL nothing answers falls back to the default query", () => {
    expect(renderAt("?f.status.any_of=nope&sort=total.asc").query).toEqual(
      BASE,
    );
    expect(renderAt("?sort=missing.asc").query).toEqual(BASE);
  });

  test("a parameter the def does not own is left alone", () => {
    expect(
      renderAt("?utm_source=mail&f.unknown.any_of=x&f.status=open&q=name")
        .query,
    ).toEqual({
      ...BASE,
      search: "name",
    });
  });

  test("without an adapter it says so", () => {
    expect(() =>
      renderToStaticMarkup(
        <QueryGridProvider
          def={DEF}
          source={source}
          columnPersistence={NO_PERSISTENCE}
        >
          <Readout />
        </QueryGridProvider>,
      ),
    ).toThrow(/adapter/i);
  });
});

interface PrefixedGrid {
  store: QueryStore;
  sync: UrlSync;
}

function connectGrid(url: UrlValues, prefix: string): PrefixedGrid {
  const store = createQueryStore(DEF, source.capabilities, BASE);
  const sync = createUrlSync(store, "", (state) =>
    Object.assign(url, toUrlValues(DEF, CAPABILITIES, state, prefix)),
  );
  sync.connect();
  return { store, sync };
}

describe("two grids on one page", () => {
  test("a prefix puts every key of a grid under its own name", () => {
    expect(Object.keys(buildUrlParsers(CAPABILITIES, "a"))).toEqual(
      Object.keys(buildUrlParsers(CAPABILITIES)).map((key) => `a.${key}`),
    );
  });

  test("each provider reads its own keys from one URL", () => {
    const [first, second] = readAll(
      <NuqsTestingAdapter searchParams="?a.f.status.any_of=open&a.q=acme&b.f.status.any_of=done&b.view=list&q=stray">
        <QueryGridProvider
          def={DEF}
          source={source}
          urlPrefix="a"
          columnPersistence={NO_PERSISTENCE}
        >
          <Readout />
        </QueryGridProvider>
        <QueryGridProvider
          def={DEF}
          source={source}
          urlPrefix="b"
          columnPersistence={NO_PERSISTENCE}
        >
          <Readout />
        </QueryGridProvider>
      </NuqsTestingAdapter>,
    );
    expect(first).toEqual({
      query: { ...BASE, filters: [statusAnyOf(["open"])], search: "acme" },
      view: "grid",
    });
    expect(second).toEqual({
      query: { ...BASE, filters: [statusAnyOf(["done"])] },
      view: "list",
    });
  });

  test("a change in one grid is written under its prefix and never reaches the other", () => {
    const url: UrlValues = {};
    const first = connectGrid(url, "a");
    const second = connectGrid(url, "b");
    first.store.dispatch({ type: "setSearch", value: "acme" });
    first.store.setView("board");
    second.sync.follow(toQueryString(CAPABILITIES, url, "b"));
    expect(second.store.getQuery()).toEqual(BASE);
    expect(second.store.getView()).toBe("grid");
    second.store.dispatch({ type: "setFilter", filter: statusAnyOf(["done"]) });
    first.sync.follow(toQueryString(CAPABILITIES, url, "a"));
    expect(first.store.getQuery()).toEqual({ ...BASE, search: "acme" });
    expect(toQueryString(CAPABILITIES, url, "a")).toBe("q=acme&view=board");
    expect(toQueryString(CAPABILITIES, url, "b")).toBe("f.status.any_of=done");
    expect(url["a.q"]).toBe("acme");
    expect(url["b.f.status.any_of"]).toEqual(["done"]);
    expect(url.q).toBeUndefined();
  });
});

describe("the actions", () => {
  test("moveRow moves through the board, then reloads the facets, the count and the total", async () => {
    const calls: string[] = [];
    const counting: DataSource = {
      ...source,
      fetchFacets: (query, signal) => {
        calls.push("facets");
        return source.fetchFacets(query, signal);
      },
      fetchCount: (query, exact, signal) => {
        calls.push("count");
        return source.fetchCount(query, exact, signal);
      },
      fetchTotals: (query, signal) => {
        calls.push("total");
        return source.fetchTotals(query, signal);
      },
      changeFacetValue: async (id, to) => {
        calls.push(`move ${id} ${to}`);
        return { ...TEST_ROWS[0], id, status: to };
      },
    };
    const captured: QueryGridActions[] = [];
    function Capture() {
      captured.push(useQueryGridActions());
      return null;
    }
    renderToStaticMarkup(
      <StaticQueryGridProvider
        def={DEF}
        source={counting}
        queryString=""
        columnPersistence={NO_PERSISTENCE}
      >
        <Capture />
      </StaticQueryGridProvider>,
    );
    const lanes = getLaneQueries(DEF, BASE, counting.capabilities);
    const board = createBoard(DEF, counting, lanes ?? new Map());
    const id = TEST_ROWS[0].id;
    const moved = await captured[0].moveRow(board, {
      id,
      from: "open",
      to: "done",
      index: 0,
    });
    expect(moved.status).toBe("done");
    expect(calls).toEqual([`move ${id} done`, "facets", "count", "total"]);
  });
});

describe("the static provider", () => {
  test("under a prefix it reads its own keys of the search prop", () => {
    expect(
      read(
        <StaticQueryGridProvider
          def={DEF}
          source={source}
          urlPrefix="b"
          queryString="f.region.any_of=north&b.f.region.any_of=south&b.view=list"
          columnPersistence={NO_PERSISTENCE}
        >
          <Readout />
        </StaticQueryGridProvider>,
      ),
    ).toEqual({
      query: { ...BASE, filters: [regionAnyOf(["south"])] },
      view: "list",
    });
  });

  test("it needs no adapter and starts from the search prop", () => {
    expect(
      read(
        <StaticQueryGridProvider
          def={DEF}
          source={source}
          queryString="f.region.any_of=south&view=list"
          columnPersistence={NO_PERSISTENCE}
        >
          <Readout />
        </StaticQueryGridProvider>,
      ),
    ).toEqual({
      query: { ...BASE, filters: [regionAnyOf(["south"])] },
      view: "list",
    });
  });
});
