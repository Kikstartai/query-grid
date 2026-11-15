import { describe, expect, test } from "bun:test";

import { isPooledConnection } from "./pg-connection";

describe("a pooled connection", () => {
  test("is told apart from a direct one by host, port or flag", () => {
    expect(
      isPooledConnection(
        "postgres://u:p@ep-cool-name-123-pooler.eu-central-1.aws.neon.tech/db",
      ),
    ).toBe(true);
    expect(isPooledConnection("postgres://u:p@db.internal:6432/db")).toBe(true);
    expect(
      isPooledConnection("postgres://u:p@db.internal/db?pgbouncer=true"),
    ).toBe(true);
    expect(
      isPooledConnection(
        "postgres://u:p@ep-cool-name-123.eu-central-1.aws.neon.tech/db",
      ),
    ).toBe(false);
    expect(isPooledConnection("postgres://u:p@localhost:5432/db")).toBe(false);
  });
});
