import { apiClient } from "./client";
export const usersApi = {
  list: () => apiClient.get("/users"),
  get: (id) => apiClient.get(`/users/${id}`),
  setRole: (id, role) => apiClient.patch(`/users/${id}/role`, { role }),
  setStatus: (id, isActive) => apiClient.patch(`/users/${id}/status`, { isActive }),
  uploadAvatar: (imageBase64) => apiClient.post("/users/me/avatar", { imageBase64 }),
  removeAvatar: () => apiClient.delete("/users/me/avatar"),
  linkFace: (imageBase64) => apiClient.post("/users/me/link-face", { imageBase64 }),
};
