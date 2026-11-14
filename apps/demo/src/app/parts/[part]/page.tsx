import { Suspense } from "react";

import { OrdersPart } from "@/core/orders/ui/orders-part";
import { PageLoading } from "@/lib/page-loading";
import type { SearchParams } from "@/lib/read-search";

interface PartPageProps {
  params: Promise<{ part: string }>;
  searchParams: SearchParams;
}

export default function OrdersPartPage({
  params,
  searchParams,
}: PartPageProps) {
  return (
    <Suspense fallback={<PageLoading />}>
      <OrdersPart params={params} searchParams={searchParams} />
    </Suspense>
  );
}
