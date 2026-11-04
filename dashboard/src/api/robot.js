import { apiClient } from "./client";
export const robotApi = {
  get: () => apiClient.get("/robot"),
  status: () => apiClient.get("/robot/status"),
  connect: () => apiClient.post("/robot/connect"),
  disconnect: () => apiClient.post("/robot/disconnect"),
};
