import { Suspense } from "react";

import { OrdersWorkspace } from "@/core/orders/ui/orders-workspace";
import { AtRequest } from "@/lib/at-request";
import { PageLoading } from "@/lib/page-loading";

export default function OrdersPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <AtRequest>
        <OrdersWorkspace />
      </AtRequest>
    </Suspense>
  );
}
