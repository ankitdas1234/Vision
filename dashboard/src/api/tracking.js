import { apiClient } from "./client";
export const trackingApi = { getConfig: () => apiClient.get("/tracking/config") };
