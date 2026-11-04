import { useEffect, useState } from "react";
import { ultrasonicApi } from "../api/ultrasonic";
import { useAuthStore, hasRole } from "../auth/authStore";
import Card from "../components/common/Card";
import Badge from "../components/common/Badge";
import Button from "../components/common/Button";

const STATUS_TONE = { CLEAR: "ok", NEAR: "ok", WARNING: "warn", OBSTACLE: "danger", VERY_CLOSE: "danger", INVALID: "neutral", SENSOR_ERROR: "danger" };

export default function Ultrasonic() {
  const { user } = useAuthStore();
  const isAdmin = hasRole(user, "ADMIN");
  const [reading, setReading] = useState(null);
  const [thresholds, setThresholds] = useState({ safeDistanceMm: 600, warningDistanceMm: 300, stopDistanceMm: 150, emergencyDistanceMm: 50 });

  const refresh = () => ultrasonicApi.read().then(setReading).catch(() => {});
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, []);

  const pct = reading ? Math.min(100, (reading.filteredDistanceMm / (thresholds.safeDistanceMm + 200)) * 100) : 0;

  return (
    <div className="space-y-6">
      <Card title="HC-SR04 Ultrasonic">
        <div className="flex items-center gap-3 mb-4">
          <Badge tone={STATUS_TONE[reading?.status] ?? "neutral"}>{reading?.status ?? "…"}</Badge>
          <span className="text-sm text-vision-text">{reading ? `${Math.round(reading.filteredDistanceMm)} mm` : "—"}</span>
          <span className="text-xs text-vision-muted">raw: {reading ? Math.round(reading.rawDistanceMm) : "—"} mm · confidence: {reading ? Math.round(reading.confidence * 100) : 0}%</span>
        </div>
        <div className="h-3 bg-vision-hover/5 rounded-full overflow-hidden mb-2">
          <div className={`h-full ${STATUS_TONE[reading?.status] === "danger" ? "bg-vision-danger" : STATUS_TONE[reading?.status] === "warn" ? "bg-vision-warn" : "bg-vision-accent"}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-vision-muted">Used for obstacle detection and movement safety — the SafetyManager blocks all gait/leg movement commands whenever this reads WARNING or worse.</p>
      </Card>

      {isAdmin && (
        <Card title="Calibration (Admin)">
          <div className="grid grid-cols-2 gap-4 mb-4">
            {Object.entries(thresholds).map(([key, value]) => (
              <label key={key} className="text-xs text-vision-muted">
                {key}
                <input type="number" value={value} onChange={(e) => setThresholds((t) => ({ ...t, [key]: Number(e.target.value) }))} className="w-full bg-vision-hover/5 rounded-lg px-3 py-1.5 text-sm outline-none mt-1" />
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => ultrasonicApi.calibrate(thresholds)}>Save Calibration</Button>
            <Button variant="ghost" onClick={() => ultrasonicApi.enable().then(refresh)}>Enable Sensor</Button>
            <Button variant="danger" onClick={() => ultrasonicApi.disable().then(refresh)}>Disable Sensor</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
