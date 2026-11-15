import { inspect } from "node:util";

import { afterEach, describe, expect, test } from "bun:test";

import { executeSql } from "./pg-executor";

const ONE = { text: "SELECT 1", values: [] };
const saved = process.env.QUERY_GRID_DATABASE_URL;

async function captureFailure(): Promise<unknown> {
  try {
    await executeSql(ONE);
  } catch (error) {
    return error;
  }
  throw new Error("expected executeSql to fail");
}

describe("the demo executor's connection string", () => {
  afterEach(() => {
    if (saved === undefined) {
      delete process.env.QUERY_GRID_DATABASE_URL;
    } else {
      process.env.QUERY_GRID_DATABASE_URL = saved;
    }
  });

  test("a missing one is named and nothing connects", async () => {
    delete process.env.QUERY_GRID_DATABASE_URL;
    const error = await captureFailure();
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("QUERY_GRID_DATABASE_URL is not set");
  });

  test("an unparseable one fails without carrying the password", async () => {
    process.env.QUERY_GRID_DATABASE_URL = "postgres://u:hunter2-secret@[bad/db";
    const error = await captureFailure();
    expect((error as Error).message).toBe(
      "QUERY_GRID_DATABASE_URL is not a valid connection string",
    );
    expect(inspect(error, { depth: 10, showHidden: true })).not.toContain(
      "hunter2-secret",
    );
  });
});
