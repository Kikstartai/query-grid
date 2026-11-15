import { notFound } from "next/navigation";

import { OrdersPart } from "@/core/orders/ui/orders-part";
import { isPartName, PART_NAMES } from "@/lib/site";

export function generateStaticParams() {
  return PART_NAMES.map((part) => ({ part }));
}

export default function OrdersPartPage({ params }: PageProps<"/parts/[part]">) {
  return params.then(({ part }) =>
    isPartName(part) ? <OrdersPart part={part} /> : notFound(),
  );
}
