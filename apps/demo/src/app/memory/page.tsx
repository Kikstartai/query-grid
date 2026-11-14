import { Suspense } from "react";

import { TasksWorkspace } from "@/core/tasks/tasks-workspace";
import { PageLoading } from "@/lib/page-loading";
import type { SearchParams } from "@/lib/read-search";

export default function MemoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<PageLoading />}>
      <TasksWorkspace searchParams={searchParams} />
    </Suspense>
  );
}
