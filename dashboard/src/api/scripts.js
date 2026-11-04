import { apiClient } from "./client";
export const scriptsApi = {
  compile: (source) => apiClient.post("/scripts/compile", { source }),
  execute: (source, robotId = "vision-001") => apiClient.post("/scripts/execute", { source, robotId }),
};
