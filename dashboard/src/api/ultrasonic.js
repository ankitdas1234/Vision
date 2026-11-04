import { apiClient } from "./client";
export const ultrasonicApi = {
  read: () => apiClient.get("/ultrasonic"),
  status: () => apiClient.get("/ultrasonic/status"),
  calibrate: (thresholds) => apiClient.post("/ultrasonic/calibrate", thresholds),
  enable: () => apiClient.post("/ultrasonic/enable"),
  disable: () => apiClient.post("/ultrasonic/disable"),
};
