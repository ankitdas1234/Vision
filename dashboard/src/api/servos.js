import { apiClient } from "./client";
export const servosApi = {
  list: () => apiClient.get("/servos"),
  move: (channel, body) => apiClient.post(`/servos/${channel}/move`, body),
  stop: (channel) => apiClient.post(`/servos/${channel}/stop`),
  center: (channel) => apiClient.post(`/servos/${channel}/center`),
  safe: () => apiClient.post("/servos/safe"),
  // The head is channel 0 and has its own endpoints (EYE_SET / EYE_CENTER):
  // 0-180 deg, camera + ultrasonic ride on it. Legs are channels 1 (left) and
  // 2 (right), both continuous rotation.
  eyeMove: (body) => apiClient.post("/servos/eye/move", body),
  eyeCenter: () => apiClient.post("/servos/eye/center"),
};
