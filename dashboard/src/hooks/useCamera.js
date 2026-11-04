import { useState } from "react";
import { cameraApi } from "../api/camera";

export function useCamera() {
  const [lastCapture, setLastCapture] = useState(null);
  const capture = async (imageBase64) => setLastCapture(await cameraApi.capture(imageBase64));
  return { lastCapture, capture, startTracking: cameraApi.startTracking, stopTracking: cameraApi.stopTracking };
}
