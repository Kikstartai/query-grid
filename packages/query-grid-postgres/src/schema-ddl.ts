import { KEY_FIELD } from "@kikstart/query-grid";

import { describeShape, isQuickShape } from "./shapes.ts";
import type { QueryShape, ServerGridDef } from "./storage.ts";
import { identifier, quickExpression } from "./sql-builder.ts";

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
}

export interface CounterObjects {
  table: string;
  columns: string[];
  triggers: string[];
}

const TRGM_OPS = "gin_trgm_ops";

function shapeIndex(def: ServerGridDef, shape: QueryShape): ShapeIndex {
  const table = identifier(def.table);
  if (isQuickShape(shape)) {
    const name = `${table}_qs_quick`;
    return {
      shape,
      name,
      method: "gin",
      columns: shape.quick.map(identifier),
      ddl: `CREATE INDEX IF NOT EXISTS ${name} ON ${table} USING gin ((${quickExpression(def)}) ${TRGM_OPS});`,
    };
  }
  const columns = [...shape.equals, shape.sort, KEY_FIELD]
    .map(identifier)
    .filter((column, index, all) => all.indexOf(column) === index);
  const name = `${table}_qs_${[...shape.equals, shape.sort].join("__")}`;
  return {
    shape,
    name,
    method: "btree",
    columns,
    ddl: `CREATE INDEX IF NOT EXISTS ${name} ON ${table} USING btree (${columns.join(", ")});`,
  };
}

export function listShapeIndexes(def: ServerGridDef): ShapeIndex[] {
  return def.shapes.map((shape) => shapeIndex(def, shape));
}

export function listCounterObjects(def: ServerGridDef): CounterObjects | null {
  if (!def.facet) {
    return null;
  }
  const table = identifier(def.facet.counterTable);
  return {
    table,
    columns: [identifier(def.facet.field), "row_count", "total_sum"],
    triggers: [
      `${table}_on_insert`,
      `${table}_on_delete`,
      `${table}_on_update`,
    ],
  };
}

function counterDdl(def: ServerGridDef): string[] {
  const counter = listCounterObjects(def);
  if (!def.facet || !counter) {
    return [];
  }
  const table = identifier(def.table);
  const facet = identifier(def.facet.field);
  const total = def.total ? identifier(def.total.field) : null;
  const ct = counter.table;
  const [onInsert, onDelete, onUpdate] = counter.triggers;
  const amount = (row: string, sign: string) =>
    total ? `${sign}${row}.${total}` : "0";
  const watched = total ? `${facet}, ${total}` : facet;
  const changed = [facet, ...(total ? [total] : [])]
    .map((name) => `OLD.${name} IS DISTINCT FROM NEW.${name}`)
    .join(" OR ");
  return [
    `-- Counter table and triggers: one row per ${facet} holding its row count${total ? ` and the sum of ${total}` : ""}.`,
    "BEGIN;",
    `CREATE TABLE IF NOT EXISTS ${ct} (${facet} text PRIMARY KEY, row_count bigint NOT NULL DEFAULT 0);`,
    `ALTER TABLE ${ct} ADD COLUMN IF NOT EXISTS total_sum bigint NOT NULL DEFAULT 0;`,
    `CREATE OR REPLACE FUNCTION ${ct}_bump(p_value text, p_rows bigint, p_sum bigint) RETURNS void LANGUAGE sql AS $$
  INSERT INTO ${ct} (${facet}, row_count, total_sum) VALUES (p_value, p_rows, p_sum)
  ON CONFLICT (${facet}) DO UPDATE SET row_count = ${ct}.row_count + EXCLUDED.row_count, total_sum = ${ct}.total_sum + EXCLUDED.total_sum;
$$;`,
    `CREATE OR REPLACE FUNCTION ${onInsert}() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ${ct}_bump(NEW.${facet}, 1, ${amount("NEW", "")});
  RETURN NULL;
END;
$$;`,
    `CREATE OR REPLACE FUNCTION ${onDelete}() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ${ct}_bump(OLD.${facet}, -1, ${amount("OLD", "-")});
  RETURN NULL;
END;
$$;`,
    `CREATE OR REPLACE FUNCTION ${onUpdate}() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ${ct}_bump(OLD.${facet}, -1, ${amount("OLD", "-")});
  PERFORM ${ct}_bump(NEW.${facet}, 1, ${amount("NEW", "")});
  RETURN NULL;
END;
$$;`,
    `LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE;`,
    `DROP TRIGGER IF EXISTS ${onInsert} ON ${table};`,
    `DROP TRIGGER IF EXISTS ${onDelete} ON ${table};`,
    `DROP TRIGGER IF EXISTS ${onUpdate} ON ${table};`,
    `UPDATE ${ct} SET row_count = 0, total_sum = 0;`,
    `INSERT INTO ${ct} (${facet}, row_count, total_sum)
  SELECT ${facet}, count(*), ${total ? `coalesce(sum(${total}), 0)` : "0"} FROM ${table} GROUP BY ${facet}
  ON CONFLICT (${facet}) DO UPDATE SET row_count = EXCLUDED.row_count, total_sum = EXCLUDED.total_sum;`,
    `CREATE TRIGGER ${onInsert} AFTER INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${onInsert}();`,
    `CREATE TRIGGER ${onDelete} AFTER DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION ${onDelete}();`,
    `CREATE TRIGGER ${onUpdate} AFTER UPDATE OF ${watched} ON ${table} FOR EACH ROW WHEN (${changed}) EXECUTE FUNCTION ${onUpdate}();`,
    "COMMIT;",
  ];
}

export function generateGridMigration(def: ServerGridDef): string {
  const indexes = listShapeIndexes(def);
  const lines = [
    `-- Generated from the ${def.table} grid def. One index per declared query shape, then the counter table and its triggers. Safe to re-run.`,
  ];
  if (indexes.some((index) => index.method === "gin")) {
    lines.push("CREATE EXTENSION IF NOT EXISTS pg_trgm;");
  }
  for (const index of indexes) {
    lines.push(`-- ${describeShape(index.shape)}`, index.ddl);
  }
  lines.push(...counterDdl(def));
  return `${lines.join("\n")}\n`;
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
  if (!parsed || parsed.method !== index.method) {
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
