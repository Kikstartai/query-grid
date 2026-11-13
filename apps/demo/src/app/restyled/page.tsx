import { Suspense } from "react";

import { RestyledWorkspace } from "@/core/orders/ui/restyled-workspace";
import { readSearch, type SearchParams } from "@/lib/read-search";

async function RestyledContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return <RestyledWorkspace search={await readSearch(searchParams)} />;
}

export default function RestyledPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<p className="page-loading">Loading…</p>}>
      <RestyledContent searchParams={searchParams} />
    </Suspense>
  );
}
