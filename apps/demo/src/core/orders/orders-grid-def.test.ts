import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  defaultQuery,
  enumerateReachableStates,
  isQueryDeclared,
  matchShape,
  shapeId,
  type QueryRules,
} from "@kikstart/query-grid";
import { createHttpSource } from "@kikstart/query-grid/http";
import {
  listTableMigrations,
  validateGridDefs,
} from "@kikstart/query-grid-postgres";

import { GRID_DEFS, resolveMigrationFile } from "../grid-defs";
import { ORDERS_API, ORDERS_GRID_DEF } from "./orders-grid-def";

const SHAPES = ORDERS_GRID_DEF.shapes;
const CAPABILITIES = createHttpSource(ORDERS_GRID_DEF, ORDERS_API).capabilities;

const RULES: QueryRules[] = [
  { capabilities: CAPABILITIES, quickComplete: false },
  { capabilities: CAPABILITIES, quickComplete: true },
];

describe("orders grid def", () => {
  test("every grid def is valid", () => {
    expect(validateGridDefs(GRID_DEFS)).toEqual([]);
  });

  test("the one def gives the client its capabilities and its cells", () => {
    expect(CAPABILITIES.quickFields).toEqual(["customer_name", "order_number"]);
    expect(CAPABILITIES.isFacetCountShown(defaultQuery(ORDERS_GRID_DEF))).toBe(
      true,
    );
    expect(ORDERS_GRID_DEF.fields.filter((field) => field.cell)).toHaveLength(
      1,
    );
  });

  test("every reachable control state is a declared shape and every shape is reached", () => {
    for (const rules of RULES) {
      const reached = new Set<string>();
      const states = enumerateReachableStates(ORDERS_GRID_DEF, rules);
      for (const state of states) {
        expect(isQueryDeclared(SHAPES, ORDERS_GRID_DEF.quick, state)).toBe(
          true,
        );
        if (state.quick === null) {
          reached.add(shapeId(matchShape(SHAPES, state)!));
        }
      }
      expect([...reached].sort()).toEqual(SHAPES.map(shapeId).sort());
      const several = states.filter((state) =>
        Object.values(state.equals).some((values) => values.length > 1),
      );
      const multiShapes = SHAPES.filter(
        (shape) =>
          "equals" in shape && shape.equals.length > 0 && shape.multi !== false,
      );
      expect(several.length > 0).toBe(multiShapes.length > 0);
      for (const state of several) {
        const shape = matchShape(SHAPES, state);
        expect(shape !== null && "equals" in shape).toBe(true);
      }
    }
  });

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
