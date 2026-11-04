import { apiClient } from "./client";
export const brainApi = {
  observe: (imageBase64, robotId = "vision-001") => apiClient.post("/brain/observe", { imageBase64, robotId }),
  process: (observationId) => apiClient.post("/brain/process", { observationId }),
};
