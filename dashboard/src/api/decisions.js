import { apiClient } from "./client";
export const decisionsApi = { list: () => apiClient.get("/decisions") };
