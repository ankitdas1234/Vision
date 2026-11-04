import { apiClient } from "./client";

/** Single switch: MANUAL vs AUTONOMOUS + Robot Mode + Compiler */
export const settingsApi = {
  getControlMode: () => apiClient.get("/system/control-mode"),
  setManualMode: (manualModeEnabled) =>
    apiClient.post("/system/control-mode", { manualModeEnabled }),

  getCompilerEnabled: () => apiClient.get("/system/settings/compiler-enabled"),
  setCompilerEnabled: (enabled) =>
    apiClient.post("/system/settings/compiler-enabled", { enabled }),

  // Runtime Hardware ↔ Simulation toggle
  getRobotMode: () => apiClient.get("/system/robot-mode"),
  setRobotMode: (mode) => apiClient.post("/system/robot-mode", { mode }),

  getFullHealth: () => apiClient.get("/system/health/full"),
};

/** Admin restrictions — "Vision, don't do that" vetoes on a command type. */
export const restrictionsApi = {
  list: () => apiClient.get("/restrictions"),
  ban: (commandType, opts = {}) =>
    apiClient.post("/restrictions", { commandType, ...opts }),
  lift: (commandType, scopedPersonId = null) =>
    apiClient.post("/restrictions/lift", { commandType, scopedPersonId }),
};