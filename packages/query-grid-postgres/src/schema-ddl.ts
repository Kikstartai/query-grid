import { isQuickShape, KEY_FIELD, type QueryShape } from "@kikstart/query-grid";

import { describeShape, validateGridDef } from "./shapes.ts";
import {
  identifier,
  quickExpression,
  shortenIdentifier,
  sumColumn,
} from "./sql-builder.ts";
import type { PostgresGridDef } from "./storage.ts";

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
const BACKFILLED = "backfilled";
const ROW_COUNT = "row_count";

function createIndex(concurrently: boolean): string {
  return concurrently
    ? "CREATE INDEX CONCURRENTLY IF NOT EXISTS"
    : "CREATE INDEX IF NOT EXISTS";
}

function shapeIndex(
  def: PostgresGridDef,
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
  def: PostgresGridDef,
  options: MigrationOptions = {},
): ShapeIndex[] {
  const concurrently = options.concurrently ?? true;
  return def.shapes.map((shape) => shapeIndex(def, shape, concurrently));
}

export function listCounterObjects(
  def: PostgresGridDef,
): CounterObjects | null {
  if (!def.facet) {
    return null;
  }
  const table = identifier(def.facet.counterTable);
  return {
    table,
    pending: shortenIdentifier(`${table}_pending`),
    columns: [
      identifier(def.facet.field),
      ROW_COUNT,
      ...(def.totals ?? []).map(sumColumn),
    ],
    functions: [shortenIdentifier(`${table}_bump`)],
    triggers: [
      shortenIdentifier(`${table}_on_insert`),
      shortenIdentifier(`${table}_on_delete`),
      shortenIdentifier(`${table}_on_update`),
    ],
  };
}

function counterSteps(def: PostgresGridDef): MigrationStep[] {
  const counter = listCounterObjects(def);
  if (!def.facet || !counter) {
    return [];
  }
  const table = identifier(def.table);
  const facet = identifier(def.facet.field);
  const totals = (def.totals ?? []).map(identifier);
  const sums = totals.map(sumColumn);
  const counted = [ROW_COUNT, ...sums];
  const ct = counter.table;
  const pending = counter.pending;
  const [bump] = counter.functions;
  const [onInsert, onDelete, onUpdate] = counter.triggers;
  const columns = [facet, ...counted].join(", ");
  const amounts = (row: string, sign: string) =>
    `ARRAY[${totals.map((total) => `${sign}${row}.${total}`).join(", ")}]::bigint[]`;
  const changed = [facet, ...totals]
    .map((name) => `OLD.${name} IS DISTINCT FROM NEW.${name}`)
    .join(" OR ");
  const bumped = [
    "p_value",
    "p_rows",
    ...sums.map((_, at) => `p_sums[${at + 1}]`),
  ].join(", ");
  const signature = `${bump}(p_value text, p_rows bigint, p_sums bigint[]) RETURNS void LANGUAGE sql`;
  const lock = `LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE;`;
  const bumpCounter = `INSERT INTO ${ct} (${columns}) VALUES (${bumped})
  ON CONFLICT (${facet}) DO UPDATE SET ${counted.map((name) => `${name} = ${ct}.${name} + EXCLUDED.${name}`).join(", ")};`;
  const skipWithoutPending = `IF to_regclass('${pending}') IS NULL THEN
    RETURN;
  END IF;`;
  const pendingColumns = [
    `${facet} text NOT NULL`,
    ...counted.map((name) => `${name} bigint NOT NULL`),
  ].join(", ");
  const install = [
    "BEGIN;",
    lock,
    `CREATE TABLE IF NOT EXISTS ${ct} (${facet} text PRIMARY KEY, ${ROW_COUNT} bigint NOT NULL DEFAULT 0);`,
    ...sums.map(
      (sum) =>
        `ALTER TABLE ${ct} ADD COLUMN IF NOT EXISTS ${sum} bigint NOT NULL DEFAULT 0;`,
    ),
    `DROP TABLE IF EXISTS ${pending};`,
    `CREATE TABLE ${pending} (${pendingColumns});`,
    `DROP FUNCTION IF EXISTS ${bump}(text, bigint, bigint);`,
    `CREATE OR REPLACE FUNCTION ${signature} AS $$
  ${bumpCounter}
  INSERT INTO ${pending} (${columns}) VALUES (${bumped});
$$;`,
    `CREATE OR REPLACE FUNCTION ${onInsert}() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ${bump}(NEW.${facet}, 1, ${amounts("NEW", "")});
  RETURN NULL;
END;
$$;`,
    `CREATE OR REPLACE FUNCTION ${onDelete}() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ${bump}(OLD.${facet}, -1, ${amounts("OLD", "-")});
  RETURN NULL;
END;
$$;`,
    `CREATE OR REPLACE FUNCTION ${onUpdate}() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ${bump}(OLD.${facet}, -1, ${amounts("OLD", "-")});
  PERFORM ${bump}(NEW.${facet}, 1, ${amounts("NEW", "")});
  RETURN NULL;
END;
$$;`,
    `DROP TRIGGER IF EXISTS ${onInsert} ON ${table};`,
    `DROP TRIGGER IF EXISTS ${onDelete} ON ${table};`,
    `DROP TRIGGER IF EXISTS ${onUpdate} ON ${table};`,
    `CREATE TRIGGER ${onInsert} AFTER INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${onInsert}();`,
    `CREATE TRIGGER ${onDelete} AFTER DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION ${onDelete}();`,
    `CREATE TRIGGER ${onUpdate} AFTER UPDATE OF ${[facet, ...totals].join(", ")} ON ${table} FOR EACH ROW WHEN (${changed}) EXECUTE FUNCTION ${onUpdate}();`,
    "COMMIT;",
  ];
  const snapshot = [
    facet,
    "count(*)",
    ...totals.map((total) => `coalesce(sum(${total}), 0)`),
  ].join(", ");
  const backfill = [
    "BEGIN ISOLATION LEVEL REPEATABLE READ;",
    `DO $backfill$
BEGIN
  ${skipWithoutPending}
  DELETE FROM ${pending};
  INSERT INTO ${pending} (${columns})
    SELECT ${snapshot} FROM ${table} GROUP BY ${facet};
  COMMENT ON TABLE ${pending} IS '${BACKFILLED}';
END
$backfill$;`,
    "COMMIT;",
  ];
  const switchOver = `DO $switch$
BEGIN
  ${skipWithoutPending}
  IF obj_description(to_regclass('${pending}'), 'pg_class') IS DISTINCT FROM '${BACKFILLED}' THEN
    RAISE EXCEPTION '${pending} holds no backfill: run the backfill step first';
  END IF;
  ${lock}
  UPDATE ${ct} SET ${counted.map((name) => `${name} = 0`).join(", ")};
  INSERT INTO ${ct} (${columns})
    SELECT ${[facet, ...counted.map((name) => `sum(${name})`)].join(", ")} FROM ${pending} GROUP BY ${facet}
    ON CONFLICT (${facet}) DO UPDATE SET ${counted.map((name) => `${name} = EXCLUDED.${name}`).join(", ")};
  CREATE OR REPLACE FUNCTION ${signature} AS $bump$
  ${bumpCounter}
$bump$;
  DROP TABLE ${pending};
END
$switch$;`;
  const subject = [facet, ...totals.map((total) => `the sum of ${total}`)].join(
    " and ",
  );
  return [
    {
      note: `Counter table for ${subject}: install the triggers. They keep ${ct} current and also log each change to ${pending}. The table lock is taken first, so no write is half way through a trigger while the counter objects change, and is held only for this short step. The pending table starts empty, so a count taken before this step no longer stands: the switch waits for a new one.`,
      sql: install.join("\n"),
      transaction: true,
    },
    {
      note: `Count ${table} from one snapshot into ${pending}, with no table lock. Changes logged before the snapshot are in the count and are discarded; later ones stay beside it. Does nothing once ${pending} is gone.`,
      sql: backfill.join("\n"),
      transaction: true,
    },
    {
      note: `Replace ${ct} with the count plus the changes logged since, and switch the triggers to write there only. The table lock is held only for this. Does nothing once ${pending} is gone, and refuses to run before the count.`,
      sql: switchOver,
      transaction: true,
    },
  ];
}

function indexSteps(
  def: PostgresGridDef,
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
  def: PostgresGridDef,
  options: MigrationOptions = {},
): MigrationStep[] {
  return [...indexSteps(def, options), ...counterSteps(def)];
}

function renderMigration(table: string, steps: MigrationStep[]): string {
  const lines = [
    `-- Generated from the ${table} grid def. One index per declared query shape, then the counter table and its triggers. Safe to re-run, whole or from the step that failed.`,
    "-- Run each statement on its own, outside a transaction: an index is built CONCURRENTLY, and the counter steps open their own transactions.",
    ...steps.flatMap((step) => [`-- ${step.note}`, step.sql]),
  ];
  return `${lines.join("\n")}\n`;
}

export function generateGridMigration(
  def: PostgresGridDef,
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
  defs: PostgresGridDef[],
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

interface Declaration {
  owner: string;
  name: string;
  definition: string;
}

function listConflicts(noun: string, declarations: Declaration[]): string[] {
  const seen = new Map<string, string>();
  return declarations.flatMap(({ owner, name, definition }) => {
    const existing = seen.get(name);
    seen.set(name, definition);
    return existing !== undefined && existing !== definition
      ? [`${owner}: ${noun} ${name} is declared with two definitions`]
      : [];
  });
}

export function validateGridDefs(defs: PostgresGridDef[]): string[] {
  const ids = defs.map((def) => def.id);
  return [
    ...defs.flatMap((def) =>
      validateGridDef(def).map((problem) => `${def.id}: ${problem}`),
    ),
    ...listConflicts(
      "index",
      defs.flatMap((def) =>
        listShapeIndexes(def).map((index) => ({
          owner: def.id,
          name: index.name,
          definition: index.ddl,
        })),
      ),
    ),
    ...listConflicts(
      "counter table",
      defs.flatMap((def) =>
        counterSteps(def)
          .slice(0, 1)
          .map((install) => ({
            owner: def.id,
            name: def.facet?.counterTable ?? "",
            definition: install.sql,
          })),
      ),
    ),
    ...[...new Set(ids.filter((id, at) => ids.indexOf(id) !== at))].map(
      (id) => `${id}: the id is used by more than one def`,
    ),
  ];
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
  def: PostgresGridDef,
  rows: PgIndexRow[],
): ShapeIndex[] {
  return listShapeIndexes(def).filter(
    (index) => !rows.some((row) => answers(index, row)),
  );
}
