import { apiClient } from "./client";
export const memoryApi = {
  search: (query) => apiClient.post("/memory/search", { query }),
  /** Admin only. Saved as VERIFIED dynamic memory (source ADMIN). */
  learn: (title, content, tag) => apiClient.post("/memory/learn", { title, content, tag }),
  /** Admin only. Saved as static memory (highest priority). */
  teachStatic: (title, content, tag) => apiClient.post("/memory/static", { title, content, tag }),
  /** Admin only. `text` has one fact per line: Title | Content | optional tag. */
  bulk: (kind, text) => apiClient.post("/memory/bulk", { kind, text }),
  listStatic: () => apiClient.get("/memory/static"),
  listDynamic: () => apiClient.get("/memory/dynamic"),
  editStatic: (key, patch) => apiClient.put(`/memory/static/${encodeURIComponent(key)}`, patch),
  editDynamic: (id, patch) => apiClient.put(`/memory/dynamic/${encodeURIComponent(id)}`, patch),
  verify: (id) => apiClient.post(`/memory/dynamic/${encodeURIComponent(id)}/verify`, {}),
  reject: (id) => apiClient.post(`/memory/dynamic/${encodeURIComponent(id)}/reject`, {}),
  removeStatic: (key) => apiClient.delete(`/memory/static/${encodeURIComponent(key)}`),
  removeDynamic: (id) => apiClient.delete(`/memory/dynamic/${encodeURIComponent(id)}`),
};
