import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "pg";

import { TOTAL_SETTINGS } from "@kikstart/query-grid-postgres";

import { createPgExecutor, type PgExecutor } from "../src/lib/pg-executor";

const SLEEP = { text: "SELECT pg_sleep(20)", values: [] };
const SHORT_SLEEP = { text: "SELECT 1 AS done FROM pg_sleep(2)", values: [] };
const ONE = { text: "SELECT 1 AS one", values: [] };
const ABORT_AFTER_MS = 500;
const CANCELED_WITHIN_MS = 5000;

const direct = process.env.QUERY_GRID_DATABASE_URL ?? "";

function getNeonPooledUrl(connectionString: string): string | null {
  const url = new URL(connectionString);
  const [first, ...rest] = url.hostname.split(".");
  if (!url.hostname.endsWith(".neon.tech") || first.endsWith("-pooler")) {
    return null;
  }
  url.hostname = [`${first}-pooler`, ...rest].join(".");
  return url.toString();
}

const connections: { name: string; url: string }[] = [
  { name: "a direct connection", url: direct },
];
const pooled = getNeonPooledUrl(direct);
if (pooled) {
  connections.push({ name: "Neon's transaction pooler", url: pooled });
}

async function abortMidQuery(
  executor: PgExecutor,
  settings: string[],
): Promise<number> {
  const controller = new AbortController();
  const started = performance.now();
  const running = executor.execute(SLEEP, settings, controller.signal);
  setTimeout(() => controller.abort(), ABORT_AFTER_MS);
  await expect(running).rejects.toMatchObject({ code: "57014" });
  return performance.now() - started;
}

for (const { name, url } of connections) {
  describe(`the demo executor under an abort signal, on ${name}`, () => {
    let executor: PgExecutor;

    beforeAll(async () => {
      executor = createPgExecutor(url);
      await Promise.all([executor.execute(ONE), executor.execute(ONE)]);
    });

    afterAll(async () => {
      await executor.end();
    });

    test("an abort cancels the running statement on the server", async () => {
      expect(await abortMidQuery(executor, [])).toBeLessThan(
        CANCELED_WITHIN_MS,
      );
    }, 30_000);

    test("an abort cancels a statement run under settings", async () => {
      expect(await abortMidQuery(executor, TOTAL_SETTINGS)).toBeLessThan(
        CANCELED_WITHIN_MS,
      );
    }, 30_000);

    test("a cancel hits only its own statement in the pool", async () => {
      const other = executor.execute<{ done: number }>(SHORT_SLEEP);
      await abortMidQuery(executor, []);
      expect(await other).toEqual([{ done: 1 }]);
    }, 30_000);

    test("a statement on another connection under another marker is untouched", async () => {
      const outside = new Client({ connectionString: url });
      await outside.connect();
      try {
        const other = outside.query<{ done: number }>(
          `/* qg:${crypto.randomUUID()} */ ${SHORT_SLEEP.text}`,
        );
        await abortMidQuery(executor, []);
        expect((await other).rows).toEqual([{ done: 1 }]);
      } finally {
        await outside.end();
      }
    }, 30_000);

    test("every statement runs under the statement budget", async () => {
      expect(
        await executor.execute({ text: "SHOW statement_timeout", values: [] }),
      ).toEqual([{ statement_timeout: "5s" }]);
    });

    test("a signal aborted before the call runs nothing", async () => {
      const started = performance.now();
      await expect(
        executor.execute(SLEEP, [], AbortSignal.abort()),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(performance.now() - started).toBeLessThan(ABORT_AFTER_MS);
    });

    test("the pool answers after the cancels", async () => {
      const signal = new AbortController().signal;
      expect(await executor.execute(ONE, [], signal)).toEqual([{ one: 1 }]);
      expect(await executor.execute(ONE)).toEqual([{ one: 1 }]);
    });
  });
}
