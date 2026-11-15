import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "pg";

import {
  listCounterObjects,
  listGridMigrationSteps,
  type PostgresGridDef,
} from "@kikstart/query-grid-postgres";

const TABLE = "query_grid_backfill_probe";

const PROBE: PostgresGridDef = {
  id: "backfill-probe",
  table: TABLE,
  defaultSort: { field: "created_at", direction: "desc" },
  facet: { field: "kind", counterTable: `${TABLE}_counts` },
  total: { field: "amount" },
  fields: [
    { key: "id", label: "ID", type: "id", operators: [] },
    {
      key: "kind",
      label: "Kind",
      type: "enum",
      operators: ["eq"],
      options: ["a", "b", "c", "d"].map((value) => ({ value, label: value })),
    },
    { key: "amount", label: "Amount", type: "money", operators: [] },
    { key: "created_at", label: "Created", type: "datetime", operators: [] },
  ],
  shapes: [
    { equals: [], sort: "created_at" },
    { equals: ["kind"], sort: "created_at" },
  ],
};

interface Counter {
  kind: string;
  rows: number;
  sum: number;
}

const counter = listCounterObjects(PROBE)!;
const migrator = new Client({
  connectionString: process.env.QUERY_GRID_DATABASE_URL,
});
const writer = new Client({
  connectionString: process.env.QUERY_GRID_DATABASE_URL,
});
const straggler = new Client({
  connectionString: process.env.QUERY_GRID_DATABASE_URL,
});

async function dropProbe(): Promise<void> {
  await migrator.query(`DROP TABLE IF EXISTS ${TABLE} CASCADE`);
  await migrator.query(`DROP TABLE IF EXISTS ${counter.table}`);
  await migrator.query(`DROP TABLE IF EXISTS ${counter.pending}`);
  for (const name of counter.triggers) {
    await migrator.query(`DROP FUNCTION IF EXISTS ${name}()`);
  }
  await migrator.query(
    `DROP FUNCTION IF EXISTS ${counter.functions[0]}(text, bigint, bigint)`,
  );
}

async function insertRows(
  client: Client,
  count: number,
  kind: string,
): Promise<void> {
  await client.query(
    `INSERT INTO ${TABLE} (kind, amount) SELECT $1, 100 + n FROM generate_series(1, $2::int) n`,
    [kind, count],
  );
}

async function churn(client: Client): Promise<void> {
  await insertRows(client, 40, "a");
  await insertRows(client, 25, "c");
  await client.query(
    `DELETE FROM ${TABLE} WHERE id IN (SELECT id FROM ${TABLE} WHERE kind = 'b' LIMIT 7)`,
  );
  await client.query(
    `UPDATE ${TABLE} SET kind = 'b' WHERE id IN (SELECT id FROM ${TABLE} WHERE kind = 'a' LIMIT 13)`,
  );
  await client.query(
    `UPDATE ${TABLE} SET amount = amount + 5 WHERE id IN (SELECT id FROM ${TABLE} WHERE kind = 'c' LIMIT 9)`,
  );
}

async function readCounters(): Promise<Counter[]> {
  const { rows } = await migrator.query<Counter>(
    `SELECT kind, row_count::float8 AS rows, total_sum::float8 AS sum FROM ${counter.table} WHERE row_count <> 0 ORDER BY kind`,
  );
  return rows;
}

async function readGrouped(): Promise<Counter[]> {
  const { rows } = await migrator.query<Counter>(
    `SELECT kind, count(*)::float8 AS rows, sum(amount)::float8 AS sum FROM ${TABLE} GROUP BY kind ORDER BY kind`,
  );
  return rows;
}

const STEPS = listGridMigrationSteps(PROBE);
const [INSTALL, BACKFILL, SWITCH_OVER] = STEPS.filter(
  (step) => step.transaction,
).map((step) => step.sql);

async function hasPending(): Promise<boolean> {
  const { rows } = await migrator.query(
    "SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = $1",
    [counter.pending],
  );
  return rows.length > 0;
}

async function migrate(between: () => Promise<void>): Promise<void> {
  for (const step of STEPS.filter((item) => !item.transaction)) {
    await migrator.query(step.sql);
  }
  await migrator.query(INSTALL);
  await between();
  await straggler.query("BEGIN");
  await insertRows(straggler, 11, "d");
  await migrator.query(BACKFILL);
  await between();
  await straggler.query("COMMIT");
  await migrator.query(SWITCH_OVER);
}

beforeAll(async () => {
  await Promise.all([
    migrator.connect(),
    writer.connect(),
    straggler.connect(),
  ]);
  await dropProbe();
  await migrator.query(
    `CREATE TABLE ${TABLE} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, amount bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
  );
  await insertRows(writer, 300, "a");
  await insertRows(writer, 200, "b");
});

afterAll(async () => {
  await dropProbe();
  await Promise.all([migrator.end(), writer.end(), straggler.end()]);
});

describe("the counter backfill", () => {
  test("it stays exact with writes before, during and after each step, and with a transaction open across the scan", async () => {
    await migrate(() => churn(writer));
    expect(await readCounters()).toEqual(await readGrouped());
    expect(await hasPending()).toBe(false);
  }, 120_000);

  test("after the switch the triggers write to the counter table directly", async () => {
    await churn(writer);
    expect(await readCounters()).toEqual(await readGrouped());
  }, 60_000);

  test("running the migration again, under writes, leaves it exact", async () => {
    await migrate(() => churn(writer));
    await churn(writer);
    const counters = await readCounters();
    expect(counters).toEqual(await readGrouped());
    expect(counters.map((row) => row.kind)).toEqual(["a", "b", "c", "d"]);
  }, 120_000);

  test("a run that stops after any step leaves the counters current", async () => {
    await migrator.query(INSTALL);
    await churn(writer);
    expect(await readCounters()).toEqual(await readGrouped());
    await migrator.query(BACKFILL.replace(/COMMIT;$/, "ROLLBACK;"));
    await churn(writer);
    expect(await readCounters()).toEqual(await readGrouped());
    await migrator.query(BACKFILL);
    await churn(writer);
    expect(await readCounters()).toEqual(await readGrouped());
    expect(await hasPending()).toBe(true);
  }, 120_000);

  test("the run after a stopped one is exact, from the top or from the step that was next", async () => {
    await migrator.query(SWITCH_OVER);
    expect(await readCounters()).toEqual(await readGrouped());
    expect(await hasPending()).toBe(false);
    await migrator.query(INSTALL);
    await churn(writer);
    await migrate(() => churn(writer));
    await churn(writer);
    expect(await readCounters()).toEqual(await readGrouped());
    expect(await hasPending()).toBe(false);
  }, 120_000);

  test("the switch refuses to run before a count, and changes nothing", async () => {
    await migrator.query(INSTALL);
    await churn(writer);
    await expect(migrator.query(SWITCH_OVER)).rejects.toThrow(/backfill/);
    expect(await readCounters()).toEqual(await readGrouped());
    expect(await hasPending()).toBe(true);
    await migrator.query(BACKFILL);
    await migrator.query(SWITCH_OVER);
    expect(await readCounters()).toEqual(await readGrouped());
  }, 120_000);

  test("a finished step run again does nothing", async () => {
    await migrator.query(BACKFILL);
    await migrator.query(SWITCH_OVER);
    await churn(writer);
    expect(await readCounters()).toEqual(await readGrouped());
    expect(await hasPending()).toBe(false);
  }, 60_000);

  test("its indexes are valid and none is missing", async () => {
    const { rows } = await migrator.query<{
      indexname: string;
      valid: boolean;
    }>(
      `SELECT c.relname AS indexname, i.indisvalid AS valid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE i.indrelid = $1::regclass`,
      [TABLE],
    );
    expect(rows.every((row) => row.valid)).toBe(true);
    expect(rows.map((row) => row.indexname)).toContain(
      `${TABLE}_qs_kind__created_at`,
    );
  }, 60_000);
});
