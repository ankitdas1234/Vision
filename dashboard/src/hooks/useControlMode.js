import { useEffect, useState, useCallback } from "react";
import { settingsApi } from "../api/settings";

/** Polls the current MANUAL/AUTONOMOUS mode. Every control page uses this
 * so their disabled state always matches server-enforced reality — the
 * server is the source of truth, this hook just reflects it in the UI. */
export function useControlMode() {
  const [mode, setMode] = useState(null); // "MANUAL" | "AUTONOMOUS" | null (loading)

  const refresh = useCallback(() => {
    settingsApi.getControlMode().then((r) => setMode(r.mode)).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  return { mode, isManual: mode === "MANUAL", loading: mode === null, refresh };
}
