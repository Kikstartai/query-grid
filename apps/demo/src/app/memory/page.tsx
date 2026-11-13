import { Suspense } from "react";

import { TasksWorkspace } from "@/core/tasks/tasks-workspace";
import { readSearch, type SearchParams } from "@/lib/read-search";

async function TasksContent({ searchParams }: { searchParams: SearchParams }) {
  return <TasksWorkspace search={await readSearch(searchParams)} />;
}

export default function MemoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<p className="page-loading">Loading…</p>}>
      <TasksContent searchParams={searchParams} />
    </Suspense>
  );
}
