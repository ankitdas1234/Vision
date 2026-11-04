import { apiClient } from "./client";
export const tasksApi = {
  list: () => apiClient.get("/tasks"),
  create: (task) => apiClient.post("/tasks", task),
  cancel: (id) => apiClient.post(`/tasks/${id}/cancel`),
};
