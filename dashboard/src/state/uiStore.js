import { useSyncExternalStore } from "react";

let state = { sidebarOpen: true, toast: null };
const listeners = new Set();

export const uiStore = {
  get: () => state,
  set: (patch) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); },
  subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
};

export function useUiStore() {
  return useSyncExternalStore(uiStore.subscribe, uiStore.get);
}
