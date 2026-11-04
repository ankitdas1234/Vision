import { useSyncExternalStore } from "react";

let state = { user: null, loading: true, initialized: false };
const listeners = new Set();

export const authStore = {
  get: () => state,
  set: (patch) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); },
  subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
};

export function useAuthStore() {
  return useSyncExternalStore(authStore.subscribe, authStore.get);
}

export const ROLE_RANK = { USER: 0, TRUSTED: 1, ADMIN: 2 };
export function hasRole(user, minRole) {
  if (!user) return false;
  return ROLE_RANK[user.role] >= ROLE_RANK[minRole];
}
