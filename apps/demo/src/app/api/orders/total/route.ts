import type { NextRequest } from "next/server";

import { decodeQuery } from "@kikstart/query-grid";

import { ORDERS_GRID } from "@/core/orders/orders-grid-def";
import { getOrdersTotal } from "@/core/orders/orders-queries";
import { respond } from "@/lib/api-response";

export function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  return respond(() => getOrdersTotal(decodeQuery(ORDERS_GRID, params)));
}
