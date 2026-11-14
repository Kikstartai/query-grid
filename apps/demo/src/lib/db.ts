import { Pool, type PoolClient, type QueryResultRow } from "pg";

import type { SqlExecutor, SqlQuery } from "@kikstart/query-grid-postgres";

const STATEMENT_BUDGET_MS = 5000;

let pool: Pool | null = null;
const backendPids = new WeakMap<PoolClient, number>();

function getPool(): Pool {
  if (pool) {
    return pool;
  }
  const connectionString = process.env.QUERY_GRID_DATABASE_URL;
  if (!connectionString) {
    throw new Error("QUERY_GRID_DATABASE_URL is not set");
  }
  pool = new Pool({
    connectionString,
    max: 4,
    statement_timeout: STATEMENT_BUDGET_MS,
    idleTimeoutMillis: 10_000,
  });
  return pool;
}

// A proxy in front of Postgres reports its own key as `client.processID`, so the pid to cancel is asked from the server, once per connection.
async function getBackendPid(client: PoolClient): Promise<number> {
  const known = backendPids.get(client);
  if (known !== undefined) {
    return known;
  }
  const { rows } = await client.query<{ pid: number }>(
    "SELECT pg_backend_pid() AS pid",
  );
  backendPids.set(client, rows[0].pid);
  return rows[0].pid;
}

async function cancelBackend(pid: number): Promise<void> {
  try {
    await getPool().query("SELECT pg_cancel_backend($1)", [pid]);
  } catch {
    return;
  }
}

async function runOnClient<T extends QueryResultRow>(
  client: PoolClient,
  query: SqlQuery,
  settings: string[],
): Promise<T[]> {
  if (settings.length === 0) {
    const result = await client.query<T>(query.text, query.values);
    return result.rows;
  }
  try {
    await client.query(
      ["BEGIN", ...settings.map((setting) => `SET LOCAL ${setting}`)].join(
        "; ",
      ),
    );
    const result = await client.query<T>(query.text, query.values);
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function runCancellable<T extends QueryResultRow>(
  client: PoolClient,
  query: SqlQuery,
  settings: string[],
  signal: AbortSignal,
): Promise<T[]> {
  const pid = await getBackendPid(client);
  signal.throwIfAborted();
  const cancels: Promise<void>[] = [];
  const cancel = () => cancels.push(cancelBackend(pid));
  signal.addEventListener("abort", cancel, { once: true });
  try {
    return await runOnClient<T>(client, query, settings);
  } finally {
    signal.removeEventListener("abort", cancel);
    // The connection is held until a cancel in flight has landed, so it cannot hit the next query to use it.
    await Promise.all(cancels);
  }
}

export const executeSql: SqlExecutor = async <T extends object>(
  query: SqlQuery,
  settings: string[] = [],
  signal?: AbortSignal,
) => {
  signal?.throwIfAborted();
  const client = await getPool().connect();
  try {
    if (signal) {
      return await runCancellable<T & QueryResultRow>(
        client,
        query,
        settings,
        signal,
      );
    }
    return await runOnClient<T & QueryResultRow>(client, query, settings);
  } finally {
    client.release();
  }
};
