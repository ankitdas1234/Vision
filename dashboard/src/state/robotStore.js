import { useState, useEffect, useSyncExternalStore } from "react";

let state = { status: "OFFLINE", capabilities: null };
const listeners = new Set();

export const robotStore = {
  get: () => state,
  set: (patch) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); },
  subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
};

export function useRobotStore() {
  return useSyncExternalStore(robotStore.subscribe, robotStore.get);
}
