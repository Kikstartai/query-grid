export type Listener = () => void;

export interface Emitter {
  emit: () => void;
  add: (listener: Listener) => () => void;
}

export function createEmitter(): Emitter {
  const listeners = new Set<Listener>();
  return {
    emit: () => listeners.forEach((listener) => listener()),
    add: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

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
