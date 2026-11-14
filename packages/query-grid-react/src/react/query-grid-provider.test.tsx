import { describe, expect, test } from "bun:test";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  defaultQuery,
  encodeQuery,
  type GridDef,
  type QueryState,
} from "@kikstart/query-grid";
import { createMemorySource } from "@kikstart/query-grid/memory";

import { TEST_FIELDS, TEST_ROWS } from "../components/fields.fixture.ts";
import {
  QueryGridProvider,
  useGridView,
  useQueryState,
} from "./query-grid-provider.tsx";
import {
  buildUrlParsers,
  readUrlState,
  toSearch,
  toUrlValues,
} from "./url-state.ts";

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

function read(element: ReactElement): { query: QueryState; view: string } {
  const html = renderToStaticMarkup(element);
  const json = html
    .replace(/^<output>|<\/output>$/g, "")
    .replaceAll("&quot;", '"');
  return JSON.parse(json) as { query: QueryState; view: string };
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
    core.set("view", "list");
    expect(new URLSearchParams(search).toString()).toBe(
      new URLSearchParams(
        [...core].sort(([a], [b]) => search.indexOf(a) - search.indexOf(b)),
      ).toString(),
    );
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

describe("the provider with the URL turned off", () => {
  test("it needs no adapter and starts from the search prop", () => {
    expect(
      read(
        <QueryGridProvider
          def={DEF}
          source={source}
          syncUrl={false}
          search="f.region=south&view=list"
          columnPersistence={null}
        >
          <Readout />
        </QueryGridProvider>,
      ),
    ).toEqual({
      query: { ...BASE, equals: { region: ["south"] } },
      view: "list",
    });
  });
});
