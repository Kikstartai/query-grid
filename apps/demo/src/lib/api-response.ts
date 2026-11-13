import { QueryRejected } from "@kikstart/query-grid/server";

export async function respond<T>(work: () => Promise<T>): Promise<Response> {
  const started = performance.now();
  try {
    const body = await work();
    return Response.json(body, {
      headers: {
        "server-timing": `db;dur=${(performance.now() - started).toFixed(1)}`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof QueryRejected) {
      return Response.json(
        { error: error.code, message: error.message },
        { status: error.code === "transition_refused" ? 409 : 400 },
      );
    }
    console.error(error);
    return Response.json(
      { error: "internal", message: "the query failed" },
      { status: 500 },
    );
  }
}
