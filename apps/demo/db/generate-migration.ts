import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { validateGridDef } from "@kikstart/query-grid";
import { generateGridMigration } from "@kikstart/query-grid/server";

import { ORDERS_GRID } from "../src/core/orders/orders-grid-def";

const target = join(import.meta.dir, "migrations", "0002_query_grid.sql");
const problems = validateGridDef(ORDERS_GRID);
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
const generated = generateGridMigration(ORDERS_GRID);

if (process.argv.includes("--check")) {
  const current = readFileSync(target, "utf8");
  if (current !== generated) {
    console.error(`${target} is stale; run db:generate`);
    process.exit(1);
  }
  console.log("0002_query_grid.sql matches the grid def");
} else {
  writeFileSync(target, generated);
  console.log(`wrote ${target}`);
}
