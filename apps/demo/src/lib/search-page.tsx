import { Suspense, type ComponentType } from "react";

import { readSearch, type SearchParams } from "./read-search";

interface SearchPageProps {
  searchParams: SearchParams;
  workspace: ComponentType<{ search: string }>;
}

async function SearchContent({
  searchParams,
  workspace: Workspace,
}: SearchPageProps) {
  return <Workspace search={await readSearch(searchParams)} />;
}

export function PageLoading() {
  return <p className="page-loading">Loading…</p>;
}

export function SearchPage(props: SearchPageProps) {
  return (
    <Suspense fallback={<PageLoading />}>
      <SearchContent {...props} />
    </Suspense>
  );
}
