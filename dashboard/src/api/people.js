import { apiClient } from "./client";
export const peopleApi = {
  list: () => apiClient.get("/people"),
  create: (person) => apiClient.post("/people", person),
  get: (id) => apiClient.get(`/people/${id}`),
  update: (id, patch) => apiClient.patch(`/people/${id}`, patch),
  timeline: (id) => apiClient.get(`/people/${id}/timeline`),
  faces: (id) => apiClient.get(`/people/${id}/faces`),
  favoriteSong: (id) => apiClient.get(`/people/${id}/favorite-song`),
  // Read-only: Vision asks about these out loud rather than a dashboard
  // button doing the correcting — see docs/people.md "Provenance".
  memories: (id) => apiClient.get(`/people/${id}/memories`),
};
