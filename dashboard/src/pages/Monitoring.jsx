import { useCallback, useEffect, useState } from "react";
import { settingsApi } from "../api/settings";
import Card from "../components/common/Card";
import Badge from "../components/common/Badge";
import Button from "../components/common/Button";
import RobotLinkCard from "../components/robot/RobotLinkCard";

const TONE_BY_STATUS = {
  OK: "ok",
  MOCK: "neutral",
  DISABLED: "neutral",
  DEGRADED: "warn",
  DOWN: "danger",
};

function OverallBanner({ overall, robotMode, checkedAt }) {
  const label = overall === "OK" ? "All systems normal" : overall === "MOCK" ? "Running in SIMULATION mode (ROBOT_MODE=simulation) — nothing here is real hardware" : overall === "DEGRADED" ? "Degraded — some subsystems need attention" : "Down — one or more subsystems are failing";
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Badge tone={TONE_BY_STATUS[overall] || "neutral"}>{overall}</Badge>
        <span className="text-sm text-vision-text">{label}</span>
        {robotMode === "hardware" && <span className="text-xs text-vision-muted">(ROBOT_MODE=hardware)</span>}
      </div>
      {checkedAt && <span className="text-xs text-vision-muted">Last checked {new Date(checkedAt).toLocaleTimeString()}</span>}
    </div>
  );
}

export default function Monitoring() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await settingsApi.getFullHealth();
      setReport(r);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load health report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    if (!autoRefresh) return undefined;
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load, autoRefresh]);

  return (
    <div className="space-y-6">
      <RobotLinkCard />
      <Card title="System Monitoring">
        <p className="text-xs text-vision-muted mb-4 max-w-lg">
          Every check here actually exercises the subsystem — a real database round trip, a real read
          of the robot link, servos, ultrasonic, audio, camera, control mode, and a live compiler
          self-test — rather than reporting a hardcoded "OK".
        </p>
        {loading ? (
          <p className="text-sm text-vision-muted">Checking…</p>
        ) : error ? (
          <p className="text-sm text-vision-danger">{error}</p>
        ) : (
          <OverallBanner {...report} />
        )}
        <div className="flex items-center gap-3 mt-4">
          <Button onClick={load}>Refresh now</Button>
          <label className="text-xs text-vision-muted flex items-center gap-2">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh every 10s
          </label>
        </div>
      </Card>

      {report && (
        <Card title="Subsystems">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {report.subsystems.map((s) => (
              <div key={s.key} className="flex items-start justify-between gap-3 bg-vision-hover/5 rounded-lg p-3">
                <div>
                  <p className="text-sm text-vision-text">{s.label}</p>
                  <p className="text-xs text-vision-muted mt-1 max-w-sm">{s.detail}</p>
                  {typeof s.latencyMs === "number" && <p className="text-[10px] text-vision-muted mt-1">{s.latencyMs}ms</p>}
                </div>
                <Badge tone={TONE_BY_STATUS[s.status] || "neutral"}>{s.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
