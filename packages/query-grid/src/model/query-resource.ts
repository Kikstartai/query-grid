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

type ResourceFetch<R> = (query: QueryState, signal: AbortSignal) => Promise<R>;

interface ResourceOptions<R> {
  initial: R;
  keepResult?: boolean;
  followsFilters?: boolean;
}

export interface QueryResource<R> {
  getState: () => ResourceState<R>;
  subscribe: (listener: Listener) => () => void;
  reload: () => void;
  refine: (fetch: ResourceFetch<R>) => void;
}

export function createQueryResource<R>(
  queryStore: QueryStore,
  fetch: ResourceFetch<R>,
  options: ResourceOptions<R>,
): QueryResource<R> {
  const store = createStore<ResourceState<R>>({
    query: queryStore.getQuery(),
    result: options.initial,
    status: "idle",
    error: null,
  });
  const begin = createAbortable();
  let started = false;

  const load = async (run: ResourceFetch<R>, keepResult: boolean) => {
    const controller = begin();
    const query = queryStore.getQuery();
    store.set({
      query,
      result: keepResult ? store.get().result : options.initial,
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

  const reload = () => void load(fetch, options.keepResult ?? false);

  return {
    getState: store.get,
    subscribe: (listener) => {
      if (!started) {
        started = true;
        if (options.followsFilters ?? true) {
          queryStore.subscribe(() => {
            if (!sameFilters(queryStore.getQuery(), store.get().query)) {
              reload();
            }
          });
        }
        reload();
      }
      return store.subscribe(listener);
    },
    reload,
    refine: (run) => void load(run, true),
  };
}
