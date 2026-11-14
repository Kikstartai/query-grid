import { KEY_FIELD } from "@kikstart/query-grid";

import { describeShape, isQuickShape, validateGridDef } from "./shapes.ts";
import { identifier, quickExpression } from "./sql-builder.ts";
import type { QueryShape, ServerGridDef } from "./storage.ts";

export const IDENTIFIER_MAX_LENGTH = 63;

const HASH_LENGTH = 8;

export interface ShapeIndex {
  shape: QueryShape;
  name: string;
  method: "btree" | "gin";
  columns: string[];
  ddl: string;
}

export interface PgIndexRow {
  indexname: string;
  indexdef: string;
  valid?: boolean;
}

export interface CounterObjects {
  table: string;
  pending: string;
  columns: string[];
  functions: string[];
  triggers: string[];
}

export interface MigrationOptions {
  concurrently?: boolean;
}

export interface MigrationStep {
  note: string;
  sql: string;
  transaction: boolean;
}

export interface TableMigration {
  table: string;
  steps: MigrationStep[];
  sql: string;
}

const TRGM_OPS = "gin_trgm_ops";

function hashName(name: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index++) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(HASH_LENGTH, "0");
}

export function shortenIdentifier(name: string): string {
  if (name.length <= IDENTIFIER_MAX_LENGTH) {
    return name;
  }
  const kept = IDENTIFIER_MAX_LENGTH - HASH_LENGTH - 1;
  return `${name.slice(0, kept)}_${hashName(name)}`;
}

function createIndex(concurrently: boolean): string {
  return concurrently
    ? "CREATE INDEX CONCURRENTLY IF NOT EXISTS"
    : "CREATE INDEX IF NOT EXISTS";
}

function shapeIndex(
  def: ServerGridDef,
  shape: QueryShape,
  concurrently: boolean,
): ShapeIndex {
  const table = identifier(def.table);
  const create = createIndex(concurrently);
  if (isQuickShape(shape)) {
    const name = shortenIdentifier(`${table}_qs_quick`);
    return {
      shape,
      name,
      method: "gin",
      columns: shape.quick.map(identifier),
      ddl: `${create} ${name} ON ${table} USING gin ((${quickExpression(def)}) ${TRGM_OPS});`,
    };
  }
  const columns = [...shape.equals, shape.sort, KEY_FIELD]
    .map(identifier)
    .filter((column, index, all) => all.indexOf(column) === index);
  const name = shortenIdentifier(
    `${table}_qs_${[...shape.equals, shape.sort].join("__")}`,
  );
  return {
    shape,
    name,
    method: "btree",
    columns,
    ddl: `${create} ${name} ON ${table} USING btree (${columns.join(", ")});`,
  };
}

export function listShapeIndexes(
  def: ServerGridDef,
  options: MigrationOptions = {},
): ShapeIndex[] {
  const concurrently = options.concurrently ?? true;
  return def.shapes.map((shape) => shapeIndex(def, shape, concurrently));
}

export function listCounterObjects(def: ServerGridDef): CounterObjects | null {
  if (!def.facet) {
    return null;
  }
  const table = identifier(def.facet.counterTable);
  return {
    table,
    pending: shortenIdentifier(`${table}_pending`),
    columns: [identifier(def.facet.field), "row_count", "total_sum"],
    functions: [shortenIdentifier(`${table}_bump`)],
    triggers: [
      shortenIdentifier(`${table}_on_insert`),
      shortenIdentifier(`${table}_on_delete`),
      shortenIdentifier(`${table}_on_update`),
    ],
  };
}

function counterSteps(def: ServerGridDef): MigrationStep[] {
  const counter = listCounterObjects(def);
  if (!def.facet || !counter) {
    return [];
  }
  const table = identifier(def.table);
  const facet = identifier(def.facet.field);
  const total = def.total ? identifier(def.total.field) : null;
  const ct = counter.table;
  const pending = counter.pending;
  const [bump] = counter.functions;
  const [onInsert, onDelete, onUpdate] = counter.triggers;
  const amount = (row: string, sign: string) =>
    total ? `${sign}${row}.${total}` : "0";
  const watched = total ? `${facet}, ${total}` : facet;
  const changed = [facet, ...(total ? [total] : [])]
    .map((name) => `OLD.${name} IS DISTINCT FROM NEW.${name}`)
    .join(" OR ");
  const signature = `${bump}(p_value text, p_rows bigint, p_sum bigint) RETURNS void LANGUAGE sql`;
  const lock = `LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE;`;
  const install = [
    "BEGIN;",
    `CREATE TABLE IF NOT EXISTS ${ct} (${facet} text PRIMARY KEY, row_count bigint NOT NULL DEFAULT 0);`,
    `ALTER TABLE ${ct} ADD COLUMN IF NOT EXISTS total_sum bigint NOT NULL DEFAULT 0;`,
    `CREATE TABLE IF NOT EXISTS ${pending} (${facet} text NOT NULL, row_count bigint NOT NULL, total_sum bigint NOT NULL);`,
    `CREATE OR REPLACE FUNCTION ${signature} AS $$
  INSERT INTO ${pending} (${facet}, row_count, total_sum) VALUES (p_value, p_rows, p_sum);
$$;`,
    `CREATE OR REPLACE FUNCTION ${onInsert}() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ${bump}(NEW.${facet}, 1, ${amount("NEW", "")});
  RETURN NULL;
END;
$$;`,
    `CREATE OR REPLACE FUNCTION ${onDelete}() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ${bump}(OLD.${facet}, -1, ${amount("OLD", "-")});
  RETURN NULL;
END;
$$;`,
    `CREATE OR REPLACE FUNCTION ${onUpdate}() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ${bump}(OLD.${facet}, -1, ${amount("OLD", "-")});
  PERFORM ${bump}(NEW.${facet}, 1, ${amount("NEW", "")});
  RETURN NULL;
END;
$$;`,
    lock,
    `DROP TRIGGER IF EXISTS ${onInsert} ON ${table};`,
    `DROP TRIGGER IF EXISTS ${onDelete} ON ${table};`,
    `DROP TRIGGER IF EXISTS ${onUpdate} ON ${table};`,
    `CREATE TRIGGER ${onInsert} AFTER INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${onInsert}();`,
    `CREATE TRIGGER ${onDelete} AFTER DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION ${onDelete}();`,
    `CREATE TRIGGER ${onUpdate} AFTER UPDATE OF ${watched} ON ${table} FOR EACH ROW WHEN (${changed}) EXECUTE FUNCTION ${onUpdate}();`,
    "COMMIT;",
  ];
  const backfill = [
    "BEGIN ISOLATION LEVEL REPEATABLE READ;",
    `UPDATE ${ct} SET row_count = 0, total_sum = 0;`,
    `INSERT INTO ${ct} (${facet}, row_count, total_sum)
  SELECT ${facet}, count(*), ${total ? `coalesce(sum(${total}), 0)` : "0"} FROM ${table} GROUP BY ${facet}
  ON CONFLICT (${facet}) DO UPDATE SET row_count = EXCLUDED.row_count, total_sum = EXCLUDED.total_sum;`,
    `DELETE FROM ${pending};`,
    "COMMIT;",
  ];
  const switchOver = [
    "BEGIN;",
    lock,
    `INSERT INTO ${ct} (${facet}, row_count, total_sum)
  SELECT ${facet}, sum(row_count), sum(total_sum) FROM ${pending} GROUP BY ${facet}
  ON CONFLICT (${facet}) DO UPDATE SET row_count = ${ct}.row_count + EXCLUDED.row_count, total_sum = ${ct}.total_sum + EXCLUDED.total_sum;`,
    `CREATE OR REPLACE FUNCTION ${signature} AS $$
  INSERT INTO ${ct} (${facet}, row_count, total_sum) VALUES (p_value, p_rows, p_sum)
  ON CONFLICT (${facet}) DO UPDATE SET row_count = ${ct}.row_count + EXCLUDED.row_count, total_sum = ${ct}.total_sum + EXCLUDED.total_sum;
$$;`,
    `DROP TABLE ${pending};`,
    "COMMIT;",
  ];
  const subject = `${facet}${total ? ` and the sum of ${total}` : ""}`;
  return [
    {
      note: `Counter table for ${subject}: install the triggers, logging each change to ${pending}. The table lock is held only for the trigger swap.`,
      sql: install.join("\n"),
      transaction: true,
    },
    {
      note: `Backfill ${ct} from one snapshot of ${table}, with no table lock. Changes logged before the snapshot are already in it and are discarded; later ones stay in ${pending}.`,
      sql: backfill.join("\n"),
      transaction: true,
    },
    {
      note: `Fold the changes logged during the backfill into ${ct} and switch the triggers to write there directly. The table lock is held only for the fold.`,
      sql: switchOver.join("\n"),
      transaction: true,
    },
  ];
}

function indexSteps(
  def: ServerGridDef,
  options: MigrationOptions,
): MigrationStep[] {
  const indexes = listShapeIndexes(def, options);
  const extension: MigrationStep[] = indexes.some(
    (index) => index.method === "gin",
  )
    ? [
        {
          note: "The quick filter needs trigram indexes.",
          sql: "CREATE EXTENSION IF NOT EXISTS pg_trgm;",
          transaction: false,
        },
      ]
    : [];
  return [
    ...extension,
    ...indexes.map((index) => ({
      note: describeShape(index.shape),
      sql: index.ddl,
      transaction: false,
    })),
  ];
}

export function listGridMigrationSteps(
  def: ServerGridDef,
  options: MigrationOptions = {},
): MigrationStep[] {
  return [...indexSteps(def, options), ...counterSteps(def)];
}

function renderMigration(table: string, steps: MigrationStep[]): string {
  const lines = [
    `-- Generated from the ${table} grid def. One index per declared query shape, then the counter table and its triggers. Safe to re-run.`,
    "-- Run each statement on its own, outside a transaction: an index is built CONCURRENTLY, and the counter steps open their own transactions.",
    ...steps.flatMap((step) => [`-- ${step.note}`, step.sql]),
  ];
  return `${lines.join("\n")}\n`;
}

export function generateGridMigration(
  def: ServerGridDef,
  options: MigrationOptions = {},
): string {
  return renderMigration(def.table, listGridMigrationSteps(def, options));
}

function mergeSteps(steps: MigrationStep[]): MigrationStep[] {
  return steps.filter(
    (step, index) =>
      steps.findIndex((other) => other.sql === step.sql) === index,
  );
}

export function listTableMigrations(
  defs: ServerGridDef[],
  options: MigrationOptions = {},
): TableMigration[] {
  const tables = [...new Set(defs.map((def) => def.table))];
  return tables.map((table) => {
    const own = defs.filter((def) => def.table === table);
    const steps = mergeSteps([
      ...own.flatMap((def) => indexSteps(def, options)),
      ...own.flatMap(counterSteps),
    ]);
    return { table, steps, sql: renderMigration(table, steps) };
  });
}

export function validateGridDefs(defs: ServerGridDef[]): string[] {
  const problems = defs.flatMap((def) =>
    validateGridDef(def).map((problem) => `${def.id}: ${problem}`),
  );
  const seen = new Map<string, string>();
  for (const def of defs) {
    for (const index of listShapeIndexes(def)) {
      const existing = seen.get(index.name);
      if (existing !== undefined && existing !== index.ddl) {
        problems.push(
          `${def.id}: index ${index.name} is declared with two definitions`,
        );
      }
      seen.set(index.name, index.ddl);
    }
  }
  const ids = defs.map((def) => def.id);
  for (const id of new Set(ids)) {
    if (ids.filter((other) => other === id).length > 1) {
      problems.push(`${id}: the id is used by more than one def`);
    }
  }
  return problems;
}

interface ParsedIndex {
  method: string;
  body: string;
}

function parseIndexDef(indexdef: string): ParsedIndex | null {
  if (indexdef.includes(" WHERE ")) {
    return null;
  }
  const match = /USING (\w+) \((.*)\)$/.exec(indexdef);
  return match ? { method: match[1], body: match[2] } : null;
}

function answers(index: ShapeIndex, row: PgIndexRow): boolean {
  const parsed = parseIndexDef(row.indexdef);
  if (!parsed || parsed.method !== index.method || row.valid === false) {
    return false;
  }
  if (index.method === "gin") {
    const names = (parsed.body.match(/[a-z_][a-z0-9_]*/g) ?? []).filter(
      (name) => index.columns.includes(name),
    );
    return (
      parsed.body.endsWith(TRGM_OPS) &&
      names.join(",") === index.columns.join(",")
    );
  }
  const columns = parsed.body.split(",").map((part) => part.trim());
  return (
    columns.length === index.columns.length &&
    index.columns.every((column, position) => columns[position] === column)
  );
}

export function listMissingIndexes(
  def: ServerGridDef,
  rows: PgIndexRow[],
): ShapeIndex[] {
  return listShapeIndexes(def).filter(
    (index) => !rows.some((row) => answers(index, row)),
  );
}
