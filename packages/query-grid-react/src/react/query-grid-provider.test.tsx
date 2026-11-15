import { describe, expect, test } from "bun:test";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  createQueryStore,
  defaultQuery,
  encodeQuery,
  type GridDef,
  type QueryState,
  type QueryStore,
} from "@kikstart/query-grid";
import { createMemorySource } from "@kikstart/query-grid/memory";

import { TEST_FIELDS, TEST_ROWS } from "../components/fields.fixture.ts";
import {
  QueryGridProvider,
  StaticQueryGridProvider,
  useGridView,
  useQueryState,
} from "./query-grid-provider.tsx";
import {
  buildUrlParsers,
  readUrlState,
  toSearch,
  toUrlValues,
  type UrlValues,
} from "./url-state.ts";
import { createUrlSync, type UrlSync } from "./url-sync.ts";

const DEF: GridDef = {
  id: "things",
  fields: TEST_FIELDS,
  defaultSort: { field: "created_at", direction: "desc" },
  facet: { field: "status" },
};
const BASE = defaultQuery(DEF);
const source = createMemorySource(DEF, TEST_ROWS, { quick: ["name"] });

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
      <QueryGridProvider def={DEF} source={source} columnPersistence={null}>
        <Readout />
      </QueryGridProvider>
    </NuqsTestingAdapter>,
  );
}

describe("the URL parsers", () => {
  test("the key map is built from the def at runtime, on core's keys", () => {
    expect(Object.keys(buildUrlParsers(DEF))).toEqual([
      "f.status",
      "f.region",
      "r.created_at",
      "r.total",
      "q",
      "sort",
      "cursor",
      "view",
    ]);
  });

  test("a state written for nuqs is the one core encodes, and reads back", () => {
    const state = {
      query: {
        ...BASE,
        equals: { status: ["open", "done"], region: ["north"] },
        range: { field: "total", min: "100", max: null },
        sort: { field: "total", direction: "asc" as const },
      },
      view: "list" as const,
    };
    const values = toUrlValues(DEF, state);
    expect(values).toEqual({
      "f.status": ["open", "done"],
      "f.region": ["north"],
      "r.created_at": null,
      "r.total": "100..",
      q: null,
      sort: "total.asc",
      cursor: null,
      view: "list",
    });
    const search = toSearch(DEF, values);
    const core = encodeQuery(DEF, state.query);
    for (const [name, value] of core) {
      expect(new URLSearchParams(search).getAll(name)).toContain(value);
    }
    expect([...new URLSearchParams(search)]).toHaveLength([...core].length + 1);
    expect(readUrlState(DEF, source.capabilities, search)).toEqual(state);
  });
});

describe("the provider under a nuqs adapter", () => {
  test("it starts from the URL, with several values, a sort and a view", () => {
    expect(
      renderAt("?f.status=open&f.status=done&sort=total.asc&view=board"),
    ).toEqual({
      query: {
        ...BASE,
        equals: { status: ["open", "done"] },
        sort: { field: "total", direction: "asc" },
      },
      view: "board",
    });
  });

  test("an empty URL is the default query in the grid view", () => {
    expect(renderAt("")).toEqual({ query: BASE, view: "grid" });
  });

  test("a URL nothing answers falls back to the default query", () => {
    expect(renderAt("?f.status=nope&sort=total.asc").query).toEqual(BASE);
    expect(renderAt("?sort=missing.asc").query).toEqual(BASE);
  });

  test("a parameter the def does not own is left alone", () => {
    expect(renderAt("?utm_source=mail&f.unknown=x&q=name").query).toEqual({
      ...BASE,
      quick: "name",
    });
  });

  test("without an adapter it says so", () => {
    expect(() =>
      renderToStaticMarkup(
        <QueryGridProvider def={DEF} source={source} columnPersistence={null}>
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
    Object.assign(url, toUrlValues(DEF, state, prefix)),
  );
  sync.connect();
  return { store, sync };
}

describe("two grids on one page", () => {
  test("a prefix puts every key of a grid under its own name", () => {
    expect(Object.keys(buildUrlParsers(DEF, "a"))).toEqual(
      Object.keys(buildUrlParsers(DEF)).map((key) => `a.${key}`),
    );
  });

  test("each provider reads its own keys from one URL", () => {
    const [first, second] = readAll(
      <NuqsTestingAdapter searchParams="?a.f.status=open&a.q=acme&b.f.status=done&b.view=list&q=stray">
        <QueryGridProvider
          def={DEF}
          source={source}
          urlPrefix="a"
          columnPersistence={null}
        >
          <Readout />
        </QueryGridProvider>
        <QueryGridProvider
          def={DEF}
          source={source}
          urlPrefix="b"
          columnPersistence={null}
        >
          <Readout />
        </QueryGridProvider>
      </NuqsTestingAdapter>,
    );
    expect(first).toEqual({
      query: { ...BASE, equals: { status: ["open"] }, quick: "acme" },
      view: "grid",
    });
    expect(second).toEqual({
      query: { ...BASE, equals: { status: ["done"] } },
      view: "list",
    });
  });

  test("a change in one grid is written under its prefix and never reaches the other", () => {
    const url: UrlValues = {};
    const first = connectGrid(url, "a");
    const second = connectGrid(url, "b");
    first.store.dispatch({ type: "setQuick", value: "acme" });
    first.store.setView("board");
    second.sync.follow(toSearch(DEF, url, "b"));
    expect(second.store.getQuery()).toEqual(BASE);
    expect(second.store.getView()).toBe("grid");
    second.store.dispatch({
      type: "setEquals",
      field: "status",
      values: ["done"],
    });
    first.sync.follow(toSearch(DEF, url, "a"));
    expect(first.store.getQuery()).toEqual({ ...BASE, quick: "acme" });
    expect(toSearch(DEF, url, "a")).toBe("q=acme&view=board");
    expect(toSearch(DEF, url, "b")).toBe("f.status=done");
    expect(url["a.q"]).toBe("acme");
    expect(url["b.f.status"]).toEqual(["done"]);
    expect(url.q).toBeUndefined();
  });

  test("without a prefix the two would share q, sort, cursor and view", () => {
    const url: UrlValues = {};
    const first = connectGrid(url, "");
    const second = connectGrid(url, "");
    first.store.dispatch({ type: "setQuick", value: "acme" });
    second.sync.follow(toSearch(DEF, url));
    expect(second.store.getQuery().quick).toBe("acme");
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
          search="f.region=north&b.f.region=south&b.view=list"
          columnPersistence={null}
        >
          <Readout />
        </StaticQueryGridProvider>,
      ),
    ).toEqual({
      query: { ...BASE, equals: { region: ["south"] } },
      view: "list",
    });
  });

  test("it needs no adapter and starts from the search prop", () => {
    expect(
      read(
        <StaticQueryGridProvider
          def={DEF}
          source={source}
          search="f.region=south&view=list"
          columnPersistence={null}
        >
          <Readout />
        </StaticQueryGridProvider>,
      ),
    ).toEqual({
      query: { ...BASE, equals: { region: ["south"] } },
      view: "list",
    });
  });
});
