import type { QueryState } from "./query-state.ts";

export type LoadStatus = "idle" | "loading" | "error";

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function createAbortable(): () => AbortController {
  let current: AbortController | null = null;
  return () => {
    current?.abort();
    current = new AbortController();
    return current;
  };
}

export function sameFilters(a: QueryState, b: QueryState): boolean {
  return (
    a.filters === b.filters && a.combine === b.combine && a.search === b.search
  );
}
