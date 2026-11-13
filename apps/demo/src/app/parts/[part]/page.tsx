import { Suspense } from "react";

import { OrdersPart } from "@/core/orders/ui/orders-part";
import { readSearch, type SearchParams } from "@/lib/read-search";
import { PageLoading } from "@/lib/search-page";

interface PartPageProps {
  params: Promise<{ part: string }>;
  searchParams: SearchParams;
}

async function PartContent({ params, searchParams }: PartPageProps) {
  const [{ part }, search] = await Promise.all([
    params,
    readSearch(searchParams),
  ]);
  return <OrdersPart part={part} search={search} />;
}

export default function OrdersPartPage(props: PartPageProps) {
  return (
    <Suspense fallback={<PageLoading />}>
      <PartContent {...props} />
    </Suspense>
  );
}
