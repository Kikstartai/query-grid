import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  listTableMigrations,
  validateGridDefs,
} from "@kikstart/query-grid-postgres";

import { resolveMigrationFile, SERVER_GRIDS } from "../src/core/server-grids";

const problems = validateGridDefs(SERVER_GRIDS);
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const check = process.argv.includes("--check");
let stale = 0;
for (const migration of listTableMigrations(SERVER_GRIDS)) {
  const name = resolveMigrationFile(migration.table);
  const target = join(import.meta.dir, "migrations", name);
  if (!check) {
    writeFileSync(target, migration.sql);
    console.log(`wrote ${target}`);
    continue;
  }
  const current = existsSync(target) ? readFileSync(target, "utf8") : null;
  if (current !== migration.sql) {
    console.error(`${target} is stale; run db:generate`);
    stale += 1;
    continue;
  }
  console.log(`${name} matches the grid defs`);
}
if (stale > 0) {
  process.exit(1);
}
