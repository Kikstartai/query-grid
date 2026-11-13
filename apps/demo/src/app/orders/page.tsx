import { OrdersWorkspace } from "@/core/orders/ui/orders-workspace";
import type { SearchParams } from "@/lib/read-search";
import { SearchPage } from "@/lib/search-page";

export default function OrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return <SearchPage searchParams={searchParams} workspace={OrdersWorkspace} />;
}
