import { apiClient } from "./client";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

/** Origin that serves /simulation/ (the API server), derived from the API base URL. */
export const SIMULATION_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

/** Simulator page URL, optionally deep-linked to a view ("compiler" | "autonomous" | "live"). */
export const simulatorUrl = (view) => `${SIMULATION_ORIGIN}/simulation/${view ? `#${view}` : ""}`;

/**
 * Simulation-only endpoints. They answer 409 NOT_SIMULATION when the server runs with
 * ROBOT_MODE=hardware, so nothing here can ever reach the real robot.
 */
export const simulationApi = {
  getMode: () => apiClient.get("/simulation/mode"),
  setMode: (mode) => apiClient.post("/simulation/mode", { mode }),
  /** Send a script to the simulator's Compiler view (the server compiles it; ADMIN only). */
  pushProgram: (source, sourceName, autoplay = false) => apiClient.post("/simulation/program", { source, sourceName, autoplay }),
};
