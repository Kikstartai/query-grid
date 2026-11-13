import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  enumerateReachableStates,
  matchShape,
  shapeId,
  validateGridDef,
  type QueryRules,
} from "@kikstart/query-grid";
import { generateGridMigration } from "@kikstart/query-grid/server";

import { ORDERS_GRID } from "./orders-grid-def";

const RULES: QueryRules[] = [
  { mode: "indexed", quickComplete: false },
  { mode: "indexed", quickComplete: true },
];

describe("orders grid def", () => {
  test("the def is valid", () => {
    expect(validateGridDef(ORDERS_GRID)).toEqual([]);
  });

  test("every reachable control state is a declared shape and every shape is reached", () => {
    for (const rules of RULES) {
      const reached = new Set<string>();
      for (const state of enumerateReachableStates(ORDERS_GRID, rules)) {
        const shape = matchShape(ORDERS_GRID, state);
        expect(shape).not.toBeNull();
        reached.add(shapeId(shape!));
      }
      expect([...reached].sort()).toEqual(
        ORDERS_GRID.shapes.map(shapeId).sort(),
      );
    }
  });

  test("the migration is the one the def generates", () => {
    const migration = readFileSync(
      join(import.meta.dir, "../../../db/migrations/0002_query_grid.sql"),
      "utf8",
    );
    expect(migration).toBe(generateGridMigration(ORDERS_GRID));
  });
});
