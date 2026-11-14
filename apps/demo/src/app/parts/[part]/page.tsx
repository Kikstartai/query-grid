import { Suspense } from "react";

import { OrdersPart } from "@/core/orders/ui/orders-part";
import { PageLoading } from "@/lib/page-loading";

interface PartPageProps {
  params: Promise<{ part: string }>;
}

export default function OrdersPartPage({ params }: PartPageProps) {
  return (
    <Suspense fallback={<PageLoading />}>
      <OrdersPart params={params} />
    </Suspense>
  );
}
