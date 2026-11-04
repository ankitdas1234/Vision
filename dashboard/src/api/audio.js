import { apiClient } from "./client";
export const audioApi = {
  startListening: () => apiClient.post("/audio/listen/start"),
  stopListening: () => apiClient.post("/audio/listen/stop"),
  speak: (text) => apiClient.post("/audio/speak", { text }),
  stop: () => apiClient.post("/audio/stop"),
  state: () => apiClient.get("/audio/state"),
};
