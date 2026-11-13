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
