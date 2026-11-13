import { TasksWorkspace } from "@/core/tasks/tasks-workspace";
import type { SearchParams } from "@/lib/read-search";
import { SearchPage } from "@/lib/search-page";

export default function MemoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return <SearchPage searchParams={searchParams} workspace={TasksWorkspace} />;
}
