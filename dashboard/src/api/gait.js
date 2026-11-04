import { apiClient } from "./client";
export const gaitApi = {
  forward: (durationMs) => apiClient.post("/gait/forward", { durationMs }),
  backward: (durationMs) => apiClient.post("/gait/backward", { durationMs }),
  left: (durationMs) => apiClient.post("/gait/left", { durationMs }),
  right: (durationMs) => apiClient.post("/gait/right", { durationMs }),
  stop: () => apiClient.post("/gait/stop"),
};
