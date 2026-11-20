import { describe, expect, test } from "bun:test";

import type { OfferContext } from "./capabilities.ts";
import { TEST_DEF } from "./grid-def.fixture.ts";
import { memoryCapabilities } from "./memory-source.ts";
import { applyAction, defaultQuery } from "./query-actions.ts";
import type { QueryState } from "./query-state.ts";

const CONTEXT: OfferContext = {
  capabilities: memoryCapabilities(TEST_DEF),
  allSearchMatchesLoaded: true,
  narrowed: null,
};

const WITH_STATUS: QueryState = {
  ...defaultQuery(TEST_DEF),
  filters: [{ field: "status", op: "any_of", values: ["open"] }],
};

describe("two lists with one field and operator", () => {
  test("a second list of the same operator is refused", () => {
    const next = applyAction(
      TEST_DEF,
      WITH_STATUS,
      {
        type: "setFilter",
        filter: { field: "status", op: "any_of", values: ["done"] },
        at: 1,
      },
      CONTEXT,
    );
    expect(next).toBe(WITH_STATUS);
  });

  test("the same list is replaced in place", () => {
    const next = applyAction(
      TEST_DEF,
      WITH_STATUS,
      {
        type: "setFilter",
        filter: { field: "status", op: "any_of", values: ["done"] },
      },
      CONTEXT,
    );
    expect(next.filters).toEqual([
      { field: "status", op: "any_of", values: ["done"] },
    ]);
  });
});
