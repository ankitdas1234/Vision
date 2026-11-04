import { apiClient } from "./client";
export const cameraApi = {
  capture: (imageBase64) => apiClient.post("/camera/capture", { imageBase64 }),
  startTracking: () => apiClient.post("/camera/tracking/start"),
  stopTracking: () => apiClient.post("/camera/tracking/stop"),
};
