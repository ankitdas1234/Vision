import { useSyncExternalStore } from "react";

let state = { lastSearch: null };
const listeners = new Set();

export const memoryStore = {
  get: () => state,
  set: (patch) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); },
  subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
};

export function useMemoryStore() {
  return useSyncExternalStore(memoryStore.subscribe, memoryStore.get);
}
