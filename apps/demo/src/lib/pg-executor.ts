import { Client, Pool, type PoolClient, type QueryResultRow } from "pg";

import type { SqlExecutor, SqlQuery } from "@kikstart/query-grid-postgres";

const STATEMENT_BUDGET_MS = 5000;

let pool: Pool | null = null;
const backendPids = new WeakMap<PoolClient, number>();

function getConnectionString(): string {
  const connectionString = process.env.QUERY_GRID_DATABASE_URL;
  if (!connectionString) {
    throw new Error("QUERY_GRID_DATABASE_URL is not set");
  }
  return connectionString;
}

function getPool(): Pool {
  if (pool) {
    return pool;
  }
  pool = new Pool({
    connectionString: getConnectionString(),
    max: 4,
    statement_timeout: STATEMENT_BUDGET_MS,
    idleTimeoutMillis: 10_000,
  });
  return pool;
}

// A proxy in front of Postgres reports its own key as `client.processID`, so the pid to cancel is asked from the server, once per connection; this needs a direct connection, not a transaction pooler.
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

// The cancel opens its own connection: one borrowed from the pool could wait forever behind the queries it is meant to stop.
async function cancelBackend(pid: number): Promise<void> {
  const client = new Client({
    connectionString: getConnectionString(),
    connectionTimeoutMillis: STATEMENT_BUDGET_MS,
  });
  try {
    await client.connect();
    await client.query("SELECT pg_cancel_backend($1)", [pid]);
  } catch {
    return;
  } finally {
    await client.end().catch(() => undefined);
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
    await client.query("ROLLBACK").catch(() => {
      throw new ConnectionPoisoned(error);
    });
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
  let canceling: Promise<void> | undefined;
  const cancel = () => {
    canceling = cancelBackend(pid);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    return await runOnClient<T>(client, query, settings);
  } finally {
    signal.removeEventListener("abort", cancel);
    // The connection is held until a cancel in flight has landed, so it cannot hit the next query to use it.
    await canceling;
  }
}

class ConnectionPoisoned extends Error {
  constructor(readonly original: unknown) {
    super("the connection could not roll back");
  }
}

export const executeSql: SqlExecutor = async <T extends object>(
  query: SqlQuery,
  settings: string[] = [],
  signal?: AbortSignal,
) => {
  signal?.throwIfAborted();
  const client = await getPool().connect();
  let poisoned = false;
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
  } catch (error) {
    if (error instanceof ConnectionPoisoned) {
      poisoned = true;
      throw error.original;
    }
    throw error;
  } finally {
    client.release(poisoned);
  }
};
