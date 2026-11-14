import { Suspense } from "react";

import { OrdersWorkspace } from "@/core/orders/ui/orders-workspace";
import { PageLoading } from "@/lib/page-loading";
import type { SearchParams } from "@/lib/read-search";

export default function OrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<PageLoading />}>
      <OrdersWorkspace searchParams={searchParams} />
    </Suspense>
  );
}
