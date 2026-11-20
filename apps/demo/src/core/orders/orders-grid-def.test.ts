import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  defaultQuery,
  enumerateReachableStates,
  isQueryIndexed,
  getIndex,
  indexId,
  isListFilter,
  TEXT_MATCH_OPS,
  toLiteralQuery,
  type OfferContext,
} from "@kikstart/query-grid";
import { createHttpSource } from "@kikstart/query-grid/http";
import {
  listTableMigrations,
  validateGridDefs,
} from "@kikstart/query-grid-postgres";

import { GRID_DEFS, resolveMigrationFile } from "../grid-defs";
import { ORDERS_API, ORDERS_GRID_DEF } from "./orders-grid-def";

const INDEXES = ORDERS_GRID_DEF.indexes;
const CAPABILITIES = createHttpSource(ORDERS_GRID_DEF, ORDERS_API).capabilities;

const CONTEXTS: OfferContext[] = [
  { capabilities: CAPABILITIES, allSearchMatchesLoaded: false },
  { capabilities: CAPABILITIES, allSearchMatchesLoaded: true },
];

describe("orders grid def", () => {
  test("every grid def is valid", () => {
    expect(validateGridDefs(GRID_DEFS)).toEqual([]);
  });

  test("the one def gives the client its capabilities and its cells", () => {
    expect(CAPABILITIES.searchFields).toEqual([
      "customer_name",
      "order_number",
    ]);
    expect(CAPABILITIES.isFacetCountExact(defaultQuery(ORDERS_GRID_DEF))).toBe(
      true,
    );
    expect(ORDERS_GRID_DEF.fields.filter((field) => field.cell)).toHaveLength(
      1,
    );
  });

  test("every reachable control state is a declared index and every index is reached", () => {
    for (const context of CONTEXTS) {
      const reached = new Set<string>();
      const states = enumerateReachableStates(ORDERS_GRID_DEF, context);
      for (const state of states) {
        const literal = toLiteralQuery(ORDERS_GRID_DEF, state, null);
        expect(
          isQueryIndexed(
            INDEXES,
            ORDERS_GRID_DEF.search,
            literal,
            ORDERS_GRID_DEF,
          ),
        ).toBe(true);
        if (state.search === null) {
          reached.add(indexId(getIndex(INDEXES, literal, ORDERS_GRID_DEF)!));
        }
      }
      expect([...reached].sort()).toEqual(INDEXES.map(indexId).sort());
      expect(
        states.some((state) =>
          state.filters.some(
            (filter) =>
              filter.field === "customer_name" &&
              TEXT_MATCH_OPS.includes(filter.op),
          ),
        ),
      ).toBe(true);
      expect(
        states.some(
          (state) =>
            state.filters.filter((filter) => TEXT_MATCH_OPS.includes(filter.op))
              .length > 1,
        ),
      ).toBe(false);
      const several = states.filter(
        (state) =>
          state.search === null &&
          state.filters.some(
            (filter) => isListFilter(filter) && filter.values.length > 1,
          ),
      );
      expect(
        states.some(
          (state) => state.search !== null && state.filters.some(isListFilter),
        ),
      ).toBe(true);
      const multiIndexes = INDEXES.filter(
        (index) => index.equals.length > 0 && index.multi !== false,
      );
      expect(several.length > 0).toBe(multiIndexes.length > 0);
      for (const state of several) {
        const index = getIndex(
          INDEXES,
          toLiteralQuery(ORDERS_GRID_DEF, state, null),
          ORDERS_GRID_DEF,
        );
        expect(index).not.toBeNull();
      }
    }
  }, 30_000);

  test("each table's migration is the one its defs generate", () => {
    const migrations = listTableMigrations(GRID_DEFS);
    expect(migrations.map((migration) => migration.table)).toEqual(["orders"]);
    for (const migration of migrations) {
      const file = readFileSync(
        join(
          import.meta.dir,
          "../../../db/migrations",
          resolveMigrationFile(migration.table),
        ),
        "utf8",
      );
      expect(file).toBe(migration.sql);
    }
  });
});
