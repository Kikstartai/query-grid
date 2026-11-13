import type { NextRequest } from "next/server";

import { listOrderOptions } from "@/core/orders/orders-queries";
import { respond } from "@/lib/api-response";

export function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  return respond(() =>
    listOrderOptions(params.get("field") ?? "", {
      query: params.get("query") ?? undefined,
      value: params.get("value") ?? undefined,
    }),
  );
}
