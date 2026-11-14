import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  enumerateReachableStates,
  type QueryRules,
} from "@kikstart/query-grid";
import {
  generateGridMigration,
  matchShape,
  shapeId,
  validateGridDef,
} from "@kikstart/query-grid-postgres";
import { capabilities } from "@kikstart/query-grid-postgres/capabilities";

import {
  ORDERS_BASE,
  ORDERS_FACET_FIELD,
  ORDERS_SHAPES,
} from "./orders-fields";
import { ORDERS_SERVER_GRID } from "./orders-server-def";

const CAPABILITIES = capabilities(ORDERS_SHAPES, {
  facetField: ORDERS_FACET_FIELD,
});

const RULES: QueryRules[] = [
  { capabilities: CAPABILITIES, quickComplete: false },
  { capabilities: CAPABILITIES, quickComplete: true },
];

describe("orders grid def", () => {
  test("the def is valid", () => {
    expect(validateGridDef(ORDERS_SERVER_GRID)).toEqual([]);
  });

  test("the client and the server share one set of fields", () => {
    expect(ORDERS_SERVER_GRID.fields).toBe(ORDERS_BASE.fields);
  });

  test("every reachable control state is a declared shape and every shape is reached", () => {
    for (const rules of RULES) {
      const reached = new Set<string>();
      const states = enumerateReachableStates(ORDERS_BASE, rules);
      for (const state of states) {
        const shape = matchShape(ORDERS_SHAPES, state);
        expect(shape).not.toBeNull();
        reached.add(shapeId(shape!));
      }
      expect([...reached].sort()).toEqual(ORDERS_SHAPES.map(shapeId).sort());
      const several = states.filter((state) =>
        Object.values(state.equals).some((values) => values.length > 1),
      );
      const multiShapes = ORDERS_SHAPES.filter(
        (shape) =>
          "equals" in shape && shape.equals.length > 0 && shape.multi !== false,
      );
      expect(several.length > 0).toBe(multiShapes.length > 0);
      for (const state of several) {
        const shape = matchShape(ORDERS_SHAPES, state);
        expect(shape !== null && "equals" in shape).toBe(true);
      }
    }
  });

  test("the migration is the one the def generates", () => {
    const migration = readFileSync(
      join(import.meta.dir, "../../../db/migrations/0002_query_grid.sql"),
      "utf8",
    );
    expect(migration).toBe(generateGridMigration(ORDERS_SERVER_GRID));
  });
});
