import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { Client, Pool, type PoolClient, type QueryResultRow } from "pg";

import type { SqlExecutor, SqlQuery } from "@kikstart/query-grid-postgres";

const STATEMENT_BUDGET_MS = 5000;
const IDLE_MS = 10_000;
const CANCEL_RETRY_MS = 25;
const BUDGET_SETTING = `statement_timeout = ${STATEMENT_BUDGET_MS}`;
const CANCEL_SQL =
  "SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE starts_with(query, $1) AND state = 'active' AND pid <> pg_backend_pid()";

export interface PgExecutor {
  execute: SqlExecutor;
  end: () => Promise<void>;
}

interface Run {
  live: boolean;
}

class ConnectionPoisoned extends Error {
  constructor(readonly original: unknown) {
    super("the connection could not roll back");
  }
}

export function createStatementMarker(): string {
  return `/* qg:${randomUUID()} */`;
}

function normalizeConnectionString(value: string | undefined): string {
  if (!value) {
    throw new Error("QUERY_GRID_DATABASE_URL is not set");
  }
  try {
    new Client({ connectionString: value });
  } catch {
    throw new Error("QUERY_GRID_DATABASE_URL is not a valid connection string");
  }
  return value;
}

// A statement budget given at connect time is a startup parameter, which a transaction pooler drops, so it rides in the transaction instead.
async function runOnClient<T extends QueryResultRow>(
  client: PoolClient,
  query: SqlQuery,
  settings: string[],
  run: Run,
): Promise<T[]> {
  try {
    await client.query(
      [
        "BEGIN",
        ...[BUDGET_SETTING, ...settings].map((s) => `SET LOCAL ${s}`),
      ].join("; "),
    );
    const result = await client
      .query<T>(query.text, query.values)
      .finally(() => {
        run.live = false;
      });
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
      throw new ConnectionPoisoned(error);
    });
    throw error;
  }
}

export function createPgExecutor(connectionString: string): PgExecutor {
  const pool = new Pool({
    connectionString: normalizeConnectionString(connectionString),
    max: 4,
    statement_timeout: STATEMENT_BUDGET_MS,
    idleTimeoutMillis: IDLE_MS,
    connectionTimeoutMillis: STATEMENT_BUDGET_MS,
  });
  // One connection outside the main pool runs every cancel in turn, so a cancel never waits behind the queries it is meant to stop.
  const cancelPool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: IDLE_MS,
    connectionTimeoutMillis: STATEMENT_BUDGET_MS,
    query_timeout: STATEMENT_BUDGET_MS,
  });
  // An idle client the server drops emits an error the pool already handles; without a listener it would end the process.
  pool.on("error", () => undefined);
  cancelPool.on("error", () => undefined);

  // A cancel that arrives before the marked statement is active finds nothing, so it tries again until the statement has settled.
  async function cancelStatement(marker: string, run: Run): Promise<void> {
    while (run.live) {
      const result = await cancelPool
        .query(CANCEL_SQL, [marker])
        .catch(() => null);
      if (result?.rowCount !== 0) {
        return;
      }
      await delay(CANCEL_RETRY_MS);
    }
  }

  const execute: SqlExecutor = async <T extends object>(
    query: SqlQuery,
    settings: string[] = [],
    signal?: AbortSignal,
  ) => {
    signal?.throwIfAborted();
    const client = await pool.connect();
    let poisoned = false;
    const marker = createStatementMarker();
    const run: Run = { live: true };
    const cancel = () => {
      void cancelStatement(marker, run);
    };
    try {
      signal?.throwIfAborted();
      signal?.addEventListener("abort", cancel, { once: true });
      return await runOnClient<T & QueryResultRow>(
        client,
        { text: `${marker} ${query.text}`, values: query.values },
        settings,
        run,
      );
    } catch (error) {
      if (error instanceof ConnectionPoisoned) {
        poisoned = true;
        throw error.original;
      }
      throw error;
    } finally {
      run.live = false;
      signal?.removeEventListener("abort", cancel);
      client.release(poisoned);
    }
  };

  return {
    execute,
    end: async () => {
      await Promise.all([pool.end(), cancelPool.end()]);
    },
  };
}

let shared: PgExecutor | null = null;

export const executeSql: SqlExecutor = async <T extends object>(
  query: SqlQuery,
  settings?: string[],
  signal?: AbortSignal,
) => {
  shared ??= createPgExecutor(process.env.QUERY_GRID_DATABASE_URL ?? "");
  return shared.execute<T>(query, settings, signal);
};
