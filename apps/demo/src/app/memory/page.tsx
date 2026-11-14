import { Suspense } from "react";

import { TasksWorkspace } from "@/core/tasks/tasks-workspace";
import { AtRequest } from "@/lib/at-request";
import { PageLoading } from "@/lib/page-loading";

export default function MemoryPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <AtRequest>
        <TasksWorkspace />
      </AtRequest>
    </Suspense>
  );
}
