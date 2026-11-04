import { useEffect, useState } from "react";
import { robotsApi } from "../api/robots";

export function useRobot() {
  const [health, setHealth] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  useEffect(() => {
    robotsApi.health().then(setHealth).catch(() => {});
    robotsApi.capabilities().then(setCapabilities).catch(() => {});
  }, []);
  return { health, capabilities };
}
