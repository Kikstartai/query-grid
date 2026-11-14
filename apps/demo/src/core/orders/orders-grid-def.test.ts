import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  enumerateReachableStates,
  type QueryRules,
} from "@kikstart/query-grid";
import {
  listTableMigrations,
  matchShape,
  shapeId,
  validateGridDefs,
} from "@kikstart/query-grid-postgres";
import { capabilities } from "@kikstart/query-grid-postgres/capabilities";

import {
  ORDERS_BASE,
  ORDERS_FACET_FIELD,
  ORDERS_SHAPES,
} from "./orders-fields";
import { resolveMigrationFile, SERVER_GRIDS } from "../server-grids";
import { ORDERS_SERVER_GRID } from "./orders-server-def";

const CAPABILITIES = capabilities(ORDERS_SHAPES, {
  facetField: ORDERS_FACET_FIELD,
});

const RULES: QueryRules[] = [
  { capabilities: CAPABILITIES, quickComplete: false },
  { capabilities: CAPABILITIES, quickComplete: true },
];

describe("orders grid def", () => {
  test("every server def is valid", () => {
    expect(validateGridDefs(SERVER_GRIDS)).toEqual([]);
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

  test("each table's migration is the one its defs generate", () => {
    const migrations = listTableMigrations(SERVER_GRIDS);
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
