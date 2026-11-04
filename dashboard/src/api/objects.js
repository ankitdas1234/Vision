import { apiClient } from "./client";
export const objectsApi = {
  list: () => apiClient.get("/objects"),
  get: (id) => apiClient.get(`/objects/${id}`),
};
