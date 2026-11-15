import { notFound } from "next/navigation";
import { Suspense } from "react";

import { OrdersPart } from "@/core/orders/ui/orders-part";
import { AtRequest } from "@/lib/at-request";
import { PageLoading } from "@/lib/page-loading";
import { isPartName, PART_NAMES } from "@/lib/site";

export function generateStaticParams() {
  return PART_NAMES.map((part) => ({ part }));
}

export default function OrdersPartPage({ params }: PageProps<"/parts/[part]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <AtRequest>
        {params.then(({ part }) =>
          isPartName(part) ? <OrdersPart part={part} /> : notFound(),
        )}
      </AtRequest>
    </Suspense>
  );
}
