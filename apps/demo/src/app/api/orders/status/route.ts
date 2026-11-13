import { changeOrderStatus } from "@/core/orders/orders-queries";
import { respond } from "@/lib/api-response";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    to?: unknown;
  } | null;
  return respond(() => changeOrderStatus(String(body?.id), String(body?.to)));
}
