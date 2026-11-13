import { Suspense } from "react";

import { OrdersWorkspace } from "@/core/orders/ui/orders-workspace";
import { readSearch, type SearchParams } from "@/lib/read-search";

async function OrdersContent({ searchParams }: { searchParams: SearchParams }) {
  return <OrdersWorkspace search={await readSearch(searchParams)} />;
}

export default function OrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<p className="page-loading">Loading…</p>}>
      <OrdersContent searchParams={searchParams} />
    </Suspense>
  );
}
