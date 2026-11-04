import { useSyncExternalStore } from "react";
import { settingsApi } from "../api/settings";
import { simulationApi } from "../api/simulation";

/**
 * Simulation view mode ("compiler" | "autonomous") shared by the Sidebar, Topbar and the
 * Simulation page — one 3 s poll for all of them, started by the first subscriber.
 *
 * `available` is true ONLY when the server is in ROBOT_MODE=simulation. In hardware mode every
 * simulation endpoint is refused and the dashboard hides all simulation UI.
 */
let state = { mode: null, available: false, loading: true, error: null };
let listeners = new Set();
let timer = null;

const emit = (next) => { state = { ...state, ...next }; listeners.forEach((l) => l()); };

async function refresh() {
  try {
    const robot = await settingsApi.getRobotMode();
    if (robot.mode !== "simulation") return emit({ available: false, mode: null, loading: false, error: null });
    const { mode } = await simulationApi.getMode();
    emit({ available: true, mode, loading: false, error: null });
  } catch (err) {
    // 409 = hardware mode, 401 = not signed in: no simulation UI either way
    emit({ available: false, loading: false, error: err.status === 409 || err.status === 401 ? null : err.message });
  }
}

function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1) { refresh(); timer = setInterval(refresh, 3000); }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) { clearInterval(timer); timer = null; }
  };
}

export async function setSimMode(mode) {
  const prev = state.mode;
  emit({ mode }); // optimistic
  try {
    const res = await simulationApi.setMode(mode);
    emit({ mode: res.mode, error: null });
  } catch (err) {
    emit({ mode: prev, error: err.status === 403 ? "Your account can't change the simulation mode (TRUSTED role or higher)." : err.message });
    throw err;
  }
}

export function useSimMode() {
  const s = useSyncExternalStore(subscribe, () => state);
  return { ...s, setMode: setSimMode, refresh };
}
