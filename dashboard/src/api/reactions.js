import { apiClient } from "./client";
export const reactionsApi = {
  list: () => apiClient.get("/reactions"),
  execute: (type, params) => apiClient.post("/reactions/execute", { type, params }),
  cancel: () => apiClient.post("/reactions/cancel"),
};
