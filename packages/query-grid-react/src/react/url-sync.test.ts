import { describe, expect, test } from "bun:test";

import {
  createQueryStore,
  defaultQuery,
  type HistoryWrite,
  type QueryStore,
} from "@kikstart/query-grid";
import { createMemorySource } from "@kikstart/query-grid/memory";

import { TEST_GRID_DEF } from "../components/fields.fixture.ts";
import { encodeStore, encodeUrlState, type UrlState } from "./url-state.ts";
import { createUrlSync } from "./url-sync.ts";

const DEF = TEST_GRID_DEF;

interface Written {
  search: string;
  history: HistoryWrite;
}

interface Harness {
  store: QueryStore;
  written: Written[];
  clock: { now: number };
  sync: ReturnType<typeof createUrlSync>;
}

function createHarness(): Harness {
  const source = createMemorySource(DEF, [], { quick: ["name"] });
  const store = createQueryStore(DEF, source.capabilities, defaultQuery(DEF));
  const written: Written[] = [];
  const clock = { now: 0 };
  const sync = createUrlSync(
    store,
    encodeStore(store),
    (state: UrlState, history) =>
      written.push({ search: encodeUrlState(DEF, state), history }),
    () => clock.now,
  );
  sync.connect();
  return { store, written, clock, sync };
}

describe("createUrlSync", () => {
  test("a discrete change is written once, as a push", () => {
    const { store, written } = createHarness();
    store.dispatch({ type: "setEquals", field: "status", values: ["open"] });
    expect(written).toEqual([{ search: "f.status=open", history: "push" }]);
  });

  test("the quick filter is written as a replace", () => {
    const { store, written } = createHarness();
    store.dispatch({ type: "setQuick", value: "acme" });
    expect(written.map((item) => item.history)).toEqual(["replace"]);
  });

  test("the URL catching up with two fast writes does not pull the store back", () => {
    const { store, written, sync } = createHarness();
    store.dispatch({ type: "setEquals", field: "status", values: ["open"] });
    store.dispatch({
      type: "setEquals",
      field: "status",
      values: ["open", "done"],
    });
    sync.follow(written[0].search);
    expect(store.getQuery().equals.status).toEqual(["open", "done"]);
    sync.follow(written[1].search);
    expect(store.getQuery().equals.status).toEqual(["open", "done"]);
    expect(written).toHaveLength(2);
  });

  test("Back to an earlier URL is followed by the store and not written again", () => {
    const { store, written, sync } = createHarness();
    store.dispatch({ type: "setEquals", field: "status", values: ["open"] });
    sync.follow(written[0].search);
    sync.follow("");
    expect(store.getQuery().equals).toEqual({});
    expect(written).toHaveLength(1);
  });

  test("an echo older than the guard window is followed as a navigation", () => {
    const { store, written, clock, sync } = createHarness();
    store.dispatch({ type: "setEquals", field: "status", values: ["open"] });
    store.dispatch({ type: "clearEquals", field: "status" });
    clock.now = 5000;
    sync.follow(written[0].search);
    expect(store.getQuery().equals.status).toEqual(["open"]);
  });

  test("a URL the def cannot hold is rewritten to what the store took from it", () => {
    const { store, written, sync } = createHarness();
    sync.follow("f.nope=1&view=sideways");
    expect(store.getQuery()).toEqual(defaultQuery(DEF));
    expect(written).toEqual([{ search: "", history: "replace" }]);
  });
});
