import { Suspense } from "react";

import { RestyledWorkspace } from "@/core/orders/ui/restyled-workspace";
import { AtRequest } from "@/lib/at-request";
import { PageLoading } from "@/lib/page-loading";

export default function RestyledPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <AtRequest>
        <RestyledWorkspace />
      </AtRequest>
    </Suspense>
  );
}
