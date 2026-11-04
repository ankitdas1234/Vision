import { apiClient } from "./client";
export const commandsApi = {
  list: () => apiClient.get("/commands"),
  dispatch: (type, params, robotId = "vision-001") => apiClient.post("/commands", { type, params, robotId }),
  emergencyStop: (robotId = "vision-001") => apiClient.post("/commands/emergency-stop", { robotId }),
  // ADMIN-only server-side (see ADMIN_ONLY_COMMANDS) — resuming after a stop
  // is a deliberate judgment call, unlike triggering one.
  emergencyClear: (reason, robotId = "vision-001") => apiClient.post("/commands/emergency-clear", { reason, robotId }),
};
