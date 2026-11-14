import { createEmitter, type Listener } from "./emitter.ts";

export interface Store<T> {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: Listener) => () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const emitter = createEmitter();
  return {
    get: () => state,
    set: (next) => {
      state = next;
      emitter.emit();
    },
    subscribe: emitter.add,
  };
}
