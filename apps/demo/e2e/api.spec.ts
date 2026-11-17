import { expect, test } from "@playwright/test";

interface ErrorBody {
  error: string;
  message: string;
  code: string;
  params: Record<string, unknown>;
}

const REFUSALS: [string, number, string, Record<string, unknown>][] = [
  ["/api/orders?f.channel=web&sort=total.desc", 400, "unindexed_query", {}],
  [
    "/api/orders?f.status_code=nope",
    400,
    "invalid_value",
    { field: "status_code" },
  ],
  ["/api/orders?limit=abc", 400, "invalid_limit", {}],
  ["/api/orders/nope", 404, "not_found", {}],
];

test.describe("the server refuses the rest", () => {
  for (const [path, status, code, params] of REFUSALS) {
    test(`${path} is ${status} ${code}`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(status);
      const body = (await response.json()) as ErrorBody;
      expect(body.error).toBe(code);
      expect(body.code).toBe(code);
      expect(body.params).toEqual(params);
      expect(body.message).not.toMatch(/ [a-z]+ [a-z]+ /);
    });
  }

  test("limit=100000 is capped at 1,000 rows", async ({ request }) => {
    const response = await request.get("/api/orders?limit=100000");
    expect(response.status()).toBe(200);
    expect(((await response.json()) as { rows: unknown[] }).rows).toHaveLength(
      1000,
    );
  });

  test("21 customer values are too many", async ({ request }) => {
    const query = Array.from(
      { length: 21 },
      (_, i) =>
        `f.customer_id=00000000-0000-7000-8000-${String(i + 1).padStart(12, "0")}`,
    ).join("&");
    const response = await request.get(`/api/orders?${query}`);
    expect(response.status()).toBe(400);
    const body = (await response.json()) as ErrorBody;
    expect(body.code).toBe("too_many_values");
    expect(body.params).toMatchObject({ max: 20 });
  });

  test("a completed order cannot move back to pending", async ({ request }) => {
    const page = await request.get(
      "/api/orders?f.status_code=completed&limit=1",
    );
    const { rows } = (await page.json()) as { rows: { id: string }[] };
    const response = await request.post("/api/orders/status", {
      data: { id: rows[0].id, to: "pending" },
    });
    expect(response.status()).toBe(409);
    const body = (await response.json()) as ErrorBody;
    expect(body.code).toBe("transition_refused");
    expect(body.params).toMatchObject({ to: "pending" });
  });

  test("GET /status is 405", async ({ request }) => {
    expect((await request.get("/api/orders/status")).status()).toBe(405);
  });

  test("responses are no-store with server timing", async ({ request }) => {
    const response = await request.get("/api/orders/count");
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["server-timing"]).toMatch(/^db;dur=/);
    const refused = await request.get("/api/orders?limit=abc");
    expect(refused.headers()["cache-control"]).toBe("no-store");
  });
});

test.describe("static shell", () => {
  for (const path of [
    "/orders",
    "/memory",
    "/features",
    "/localized/af",
    "/restyled",
    "/rtl",
    "/parts/grid",
  ]) {
    test(`${path} holds the brand and a skeleton, no grid part and no loading text`, async ({
      request,
    }) => {
      const html = await (await request.get(path)).text();
      const cut = html.indexOf('hidden id="S:');
      const shell = cut < 0 ? html : html.slice(0, cut);
      expect(shell).toContain('data-brand="header"');
      expect(shell).toContain("data-skeleton=");
      const parts = [...shell.matchAll(/data-part="([^"]+)"/g)].map(
        (match) => match[1],
      );
      expect(parts.filter((part) => part !== "theme-toggle")).toEqual([]);
      expect(shell).not.toContain("Loading…");
    });
  }

  test("the theme script is in the head and the server sets no theme", async ({
    request,
  }) => {
    const html = await (await request.get("/orders")).text();
    const script = html.indexOf("query-grid:theme");
    expect(script).toBeGreaterThan(0);
    expect(script).toBeLessThan(html.indexOf("<body"));
    expect(html.match(/<html[^>]*>/)?.[0]).not.toContain("data-theme");
  });

  test("an unknown part is a 404", async ({ request }) => {
    expect((await request.get("/parts/nope")).status()).toBe(404);
  });
});
