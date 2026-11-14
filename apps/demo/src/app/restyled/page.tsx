import { Suspense } from "react";

import { RestyledWorkspace } from "@/core/orders/ui/restyled-workspace";
import { PageLoading } from "@/lib/page-loading";
import type { SearchParams } from "@/lib/read-search";

export default function RestyledPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<PageLoading />}>
      <RestyledWorkspace searchParams={searchParams} />
    </Suspense>
  );
}
