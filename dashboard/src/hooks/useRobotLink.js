import { useEffect, useState } from "react";
import { robotsApi } from "../api/robots";

/** Polls the robot connection status (mode, transport, heartbeat, body). One shared 2 s timer per mounted consumer. */
export function useRobotLink(intervalMs = 2000) {
  const [link, setLink] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () =>
      robotsApi.link()
        .then((l) => { if (alive) { setLink(l); setError(false); } })
        .catch(() => { if (alive) setError(true); });
    load();
    const id = setInterval(load, intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [intervalMs]);
  return { link, error };
}
