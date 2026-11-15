import { randomUUID } from "node:crypto";

import { Client, Pool, type PoolClient, type QueryResultRow } from "pg";

import type { SqlExecutor, SqlQuery } from "@kikstart/query-grid-postgres";

const STATEMENT_BUDGET_MS = 5000;
const IDLE_MS = 10_000;
const BUDGET_SETTING = `statement_timeout = ${STATEMENT_BUDGET_MS}`;
const CANCEL_SQL =
  "SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE starts_with(query, $1) AND state = 'active' AND pid <> pg_backend_pid()";

export interface PgExecutor {
  execute: SqlExecutor;
  end: () => Promise<void>;
}

class ConnectionPoisoned extends Error {
  constructor(readonly original: unknown) {
    super("the connection could not roll back");
  }
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
  signal: AbortSignal | undefined,
): Promise<T[]> {
  try {
    await client.query(
      [
        "BEGIN",
        ...[BUDGET_SETTING, ...settings].map((s) => `SET LOCAL ${s}`),
      ].join("; "),
    );
    // The cancel can only find the marked statement, so an abort that landed during BEGIN is honoured here.
    signal?.throwIfAborted();
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

export function createPgExecutor(connectionString: string): PgExecutor {
  const pool = new Pool({
    connectionString,
    max: 4,
    statement_timeout: STATEMENT_BUDGET_MS,
    idleTimeoutMillis: IDLE_MS,
    connectionTimeoutMillis: STATEMENT_BUDGET_MS,
  });
  // An idle client the server drops emits an error the pool already handles; without a listener it would end the process.
  pool.on("error", () => undefined);
  let canceller: Promise<Client> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  function dropCanceller() {
    const closing = canceller;
    canceller = null;
    clearTimeout(idleTimer);
    void closing?.then((client) => client.end()).catch(() => undefined);
  }

  // One connection outside the pool answers every cancel, so a cancel never waits behind the queries it is meant to stop; the client runs its queries one at a time.
  function getCanceller(): Promise<Client> {
    if (canceller) {
      return canceller;
    }
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: STATEMENT_BUDGET_MS,
      query_timeout: STATEMENT_BUDGET_MS,
    });
    const connecting = client.connect().then(() => client);
    client.on("error", () => {
      if (canceller === connecting) {
        dropCanceller();
      }
    });
    canceller = connecting;
    return connecting;
  }

  async function cancelStatement(marker: string): Promise<void> {
    const used = getCanceller();
    try {
      const client = await used;
      await client.query(CANCEL_SQL, [marker]);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(dropCanceller, IDLE_MS);
      idleTimer.unref?.();
    } catch {
      if (canceller === used) {
        dropCanceller();
      }
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
    const marker = `/* qg:${randomUUID()} */`;
    const cancel = () => {
      void cancelStatement(marker);
    };
    try {
      signal?.throwIfAborted();
      signal?.addEventListener("abort", cancel, { once: true });
      return await runOnClient<T & QueryResultRow>(
        client,
        { text: `${marker} ${query.text}`, values: query.values },
        settings,
        signal,
      );
    } catch (error) {
      if (error instanceof ConnectionPoisoned) {
        poisoned = true;
        throw error.original;
      }
      throw error;
    } finally {
      signal?.removeEventListener("abort", cancel);
      client.release(poisoned);
    }
  };

  return {
    execute,
    end: async () => {
      dropCanceller();
      await pool.end();
    },
  };
}

let shared: PgExecutor | null = null;

export const executeSql: SqlExecutor = async <T extends object>(
  query: SqlQuery,
  settings?: string[],
  signal?: AbortSignal,
) => {
  shared ??= createPgExecutor(
    normalizeConnectionString(process.env.QUERY_GRID_DATABASE_URL),
  );
  return shared.execute<T>(query, settings, signal);
};
