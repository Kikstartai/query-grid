import { beforeAll, describe, expect, test } from "bun:test";

import { TOTAL_SETTINGS } from "@kikstart/query-grid-postgres";

import { executeSql } from "../src/lib/db";

const SLEEP = { text: "SELECT pg_sleep(20)", values: [] };
const ONE = { text: "SELECT 1 AS one", values: [] };
const ABORT_AFTER_MS = 500;
const CANCELED_WITHIN_MS = 5000;

async function abortMidQuery(settings: string[]): Promise<number> {
  const controller = new AbortController();
  const started = performance.now();
  const running = executeSql(SLEEP, settings, controller.signal);
  setTimeout(() => controller.abort(), ABORT_AFTER_MS);
  await expect(running).rejects.toMatchObject({ code: "57014" });
  return performance.now() - started;
}

describe("the demo executor under an abort signal", () => {
  beforeAll(async () => {
    await executeSql(ONE, [], new AbortController().signal);
  });

  test("an abort cancels the running statement on the server", async () => {
    expect(await abortMidQuery([])).toBeLessThan(CANCELED_WITHIN_MS);
  }, 30_000);

  test("an abort cancels a statement run under settings", async () => {
    expect(await abortMidQuery(TOTAL_SETTINGS)).toBeLessThan(
      CANCELED_WITHIN_MS,
    );
  }, 30_000);

  test("a signal aborted before the call runs nothing", async () => {
    const started = performance.now();
    await expect(
      executeSql(SLEEP, [], AbortSignal.abort()),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(performance.now() - started).toBeLessThan(ABORT_AFTER_MS);
  });

  test("the pool answers after the cancels", async () => {
    const signal = new AbortController().signal;
    expect(await executeSql(ONE, [], signal)).toEqual([{ one: 1 }]);
    expect(await executeSql(ONE)).toEqual([{ one: 1 }]);
  });
});
