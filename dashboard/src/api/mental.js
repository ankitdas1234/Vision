import { apiClient } from "./client";
export const mentalApi = {
  state: () => apiClient.get("/mental/state"),
  curiosity: () => apiClient.get("/mental/curiosity"),
};
