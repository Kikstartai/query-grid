import { Pool, type QueryResultRow } from "pg";

import type { SqlExecutor, SqlQuery } from "@kikstart/query-grid-postgres";

const STATEMENT_BUDGET_MS = 5000;

let pool: Pool | null = null;

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

async function executeWithSettings<T extends QueryResultRow>(
  query: SqlQuery,
  settings: string[],
): Promise<T[]> {
  const client = await getPool().connect();
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
  } finally {
    client.release();
  }
}

export const executeSql: SqlExecutor = async <T extends object>(
  query: SqlQuery,
  settings?: string[],
) => {
  if (settings?.length) {
    return executeWithSettings<T & QueryResultRow>(query, settings);
  }
  const result = await getPool().query<T & QueryResultRow>(
    query.text,
    query.values,
  );
  return result.rows;
};
