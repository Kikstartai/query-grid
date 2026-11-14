import { handleOrdersRequest } from "@/core/orders/orders-handler";

export function GET(request: Request): Promise<Response> {
  return handleOrdersRequest(request);
}

export function POST(request: Request): Promise<Response> {
  return handleOrdersRequest(request);
}
