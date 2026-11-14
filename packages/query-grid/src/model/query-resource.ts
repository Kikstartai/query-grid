import type { Listener } from "./emitter.ts";
import type { QueryState } from "./field-types.ts";
import {
  createAbortable,
  isAbort,
  sameFilters,
  type LoadStatus,
} from "./load.ts";
import { toProblem, type Problem } from "./problems.ts";
import type { QueryStore } from "./query-store.ts";
import { createStore } from "./store.ts";

export interface ResourceState<R> {
  query: QueryState;
  result: R;
  status: LoadStatus;
  error: Problem | null;
}

export type ResourceFetch<R> = (
  query: QueryState,
  signal: AbortSignal,
) => Promise<R>;

export interface ResourceOptions<R> {
  initial: R;
  keepResult?: boolean;
  follows?: (next: QueryState, current: QueryState) => boolean;
}

export interface QueryResource<R> {
  getState: () => ResourceState<R>;
  subscribe: (listener: Listener) => () => void;
  reload: () => void;
  load: (fetch: ResourceFetch<R>, keepResult: boolean) => void;
}

export function createQueryResource<R>(
  queryStore: QueryStore,
  fetch: ResourceFetch<R>,
  options: ResourceOptions<R>,
): QueryResource<R> {
  const keepResult = options.keepResult ?? false;
  const follows =
    options.follows ??
    ((next: QueryState, current: QueryState) => !sameFilters(next, current));
  const store = createStore<ResourceState<R>>({
    query: queryStore.getQuery(),
    result: options.initial,
    status: "idle",
    error: null,
  });
  const begin = createAbortable();
  let started = false;

  const load = async (run: ResourceFetch<R>, keep: boolean) => {
    const controller = begin();
    const query = queryStore.getQuery();
    store.set({
      query,
      result: keep ? store.get().result : options.initial,
      status: "loading",
      error: null,
    });
    try {
      const result = await run(query, controller.signal);
      if (!controller.signal.aborted) {
        store.set({ ...store.get(), result, status: "idle" });
      }
    } catch (error) {
      if (!isAbort(error)) {
        store.set({
          ...store.get(),
          status: "error",
          error: toProblem(error),
        });
      }
    }
  };

  const reload = () => void load(fetch, keepResult);

  return {
    getState: store.get,
    subscribe: (listener) => {
      if (!started) {
        started = true;
        queryStore.subscribe(() => {
          if (follows(queryStore.getQuery(), store.get().query)) {
            reload();
          }
        });
        reload();
      }
      return store.subscribe(listener);
    },
    reload,
    load: (run, keep) => void load(run, keep),
  };
}
