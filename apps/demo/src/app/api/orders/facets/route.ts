import { connection } from "next/server";

import { listStatusCounts } from "@/core/orders/orders-queries";
import { respond } from "@/lib/api-response";

export async function GET(): Promise<Response> {
  await connection();
  return respond(listStatusCounts);
}
