import { useState, useEffect, useCallback } from "react";
import { useSocketEvent } from "../hooks/useSocket";
import { commandsApi } from "../api/commands";
import { restrictionsApi } from "../api/settings";
import { useAuthStore, hasRole } from "../auth/authStore";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import Badge from "../components/common/Badge";
import EmptyState from "../components/common/EmptyState";

// Mirrors server/src/packages/types.ts COMMAND_TYPES. Kept as a plain local
// constant (rather than importing it) because the dashboard is a standalone
// Vite app with no dependency on the server's source tree — adding one
// would couple its build to the backend. If this list and the server's
// ever drift, the server is the source of truth; a mismatched string here
// just won't validate server-side.
const COMMAND_TYPES = [
  "CAMERA_CAPTURE", "CAMERA_START_TRACKING", "CAMERA_STOP_TRACKING",
  "AUDIO_START_LISTENING", "AUDIO_STOP_LISTENING", "AUDIO_SPEAK", "AUDIO_STOP",
  "EYE_CENTER", "EYE_LEFT", "EYE_RIGHT", "EYE_SET", "EYE_TRACK_PERSON",
  "LEFT_LEG_FORWARD", "LEFT_LEG_REVERSE", "LEFT_LEG_ROTATE", "LEFT_LEG_STOP",
  "RIGHT_LEG_FORWARD", "RIGHT_LEG_REVERSE", "RIGHT_LEG_ROTATE", "RIGHT_LEG_STOP",
  "WALK_FORWARD", "WALK_BACKWARD", "TURN_LEFT", "TURN_RIGHT", "WALK_STOP",
  "ULTRASONIC_READ", "ULTRASONIC_CALIBRATE", "ULTRASONIC_ENABLE", "ULTRASONIC_DISABLE",
  "SERVOS_SAFE", "EMERGENCY_STOP", "EMERGENCY_CLEAR",
  "BRAIN_OBSERVE", "BRAIN_PROCESS",
  "MEMORY_SEARCH", "MEMORY_LEARN",
  "TASK_START", "TASK_CANCEL",
  "SCRIPT_COMPILE", "SCRIPT_EXECUTE",
];

function RestrictionsPanel() {
  const { user } = useAuthStore();
  const isAdmin = hasRole(user, "ADMIN");
  const [restrictions, setRestrictions] = useState([]);
  const [commandType, setCommandType] = useState(COMMAND_TYPES[0]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRestrictions(await restrictionsApi.list());
  }, []);

  useEffect(() => { load(); }, [load]);

  const addRestriction = async () => {
    setBusy(true);
    try {
      await restrictionsApi.ban(commandType, { reason: reason || undefined });
      setReason("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const lift = async (r) => {
    setBusy(true);
    try {
      await restrictionsApi.lift(r.commandType, r.scopedPersonId);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Admin restrictions">
      <p className="text-xs text-vision-muted mb-4 max-w-lg">
        "Vision, don't do that" — a standing veto on a command type. Once set, that command is blocked
        for everyone (or just the person it's scoped to) until an admin lifts it here or by voice
        ("that's allowed again").
      </p>

      {restrictions.length === 0 ? (
        <EmptyState message="No active restrictions." />
      ) : (
        <div className="space-y-2 mb-4">
          {restrictions.map((r) => (
            <div key={r.id} className="flex items-center justify-between bg-vision-hover/5 rounded-lg p-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge tone="warn">{r.commandType}</Badge>
                  {r.scopedPersonId && <span className="text-xs text-vision-muted">for one person only</span>}
                </div>
                {r.reason && <p className="text-xs text-vision-muted mt-1">{r.reason}</p>}
              </div>
              {isAdmin && <Button variant="ghost" onClick={() => lift(r)} disabled={busy}>Lift</Button>}
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="flex items-center gap-2">
          <select
            value={commandType}
            onChange={(e) => setCommandType(e.target.value)}
            className="bg-vision-hover/5 text-sm text-vision-text rounded-lg px-2 py-1.5"
          >
            {COMMAND_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="bg-vision-hover/5 text-sm text-vision-text rounded-lg px-2 py-1.5 flex-1"
          />
          <Button onClick={addRestriction} disabled={busy}>Restrict</Button>
        </div>
      )}
    </Card>
  );
}

function EmergencyControls() {
  const { user } = useAuthStore();
  const isAdmin = hasRole(user, "ADMIN");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const stop = async () => {
    setBusy(true);
    setError(null);
    try {
      await commandsApi.emergencyStop();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!reason.trim()) { setError("A reason is required to resume — say what you checked."); return; }
    setBusy(true);
    setError(null);
    try {
      await commandsApi.emergencyClear(reason.trim());
      setReason("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Safety">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="danger" onClick={stop} disabled={busy}>Trigger Emergency Stop</Button>
        {isAdmin ? (
          <div className="flex items-center gap-2">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason it's safe to resume (required)"
              className="bg-vision-hover/5 text-sm text-vision-text rounded-lg px-2 py-1.5 w-72"
            />
            <Button variant="ghost" onClick={clear} disabled={busy}>Clear Emergency Stop</Button>
          </div>
        ) : (
          <span className="text-xs text-vision-muted">Only an ADMIN can clear an emergency stop and resume normal operation.</span>
        )}
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </Card>
  );
}

export default function Safety() {
  const event = useSocketEvent("safety:event");
  return (
    <div className="space-y-6">
      <EmergencyControls />
      <Card title="Recent safety events">
        {event ? <pre className="text-xs text-vision-muted whitespace-pre-wrap">{JSON.stringify(event, null, 2)}</pre> : <EmptyState message="No safety events." />}
      </Card>
      <RestrictionsPanel />
    </div>
  );
}
