import { RestyledWorkspace } from "@/core/orders/ui/restyled-workspace";
import type { SearchParams } from "@/lib/read-search";
import { SearchPage } from "@/lib/search-page";

export default function RestyledPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return <SearchPage searchParams={searchParams} workspace={RestyledWorkspace} />;
}
