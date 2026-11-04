import { useSyncExternalStore } from "react";

let state = { lastDecision: null, mentalState: null };
const listeners = new Set();

export const brainStore = {
  get: () => state,
  set: (patch) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); },
  subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
};

export function useBrainStore() {
  return useSyncExternalStore(brainStore.subscribe, brainStore.get);
}
