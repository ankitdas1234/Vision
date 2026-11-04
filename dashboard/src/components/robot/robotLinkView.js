/**
 * Pure display logic for the robot connection — no React, so it's easy to test.
 * Input: the object from GET /api/system/robot-link (server/src/robot/linkStatus.ts).
 */

const TRANSPORT = {
  simulator: { label: "Simulator", tone: "neutral" },
  websocket: { label: "WebSocket live", tone: "ok" },
  http: { label: "HTTP fallback", tone: "warn" },
  none: { label: "Not connected", tone: "danger" },
};

export function modeBadge(link) {
  if (!link) return { label: "…", tone: "neutral" };
  return link.mode === "simulation" ? { label: "SIMULATION", tone: "warn" } : { label: "HARDWARE", tone: "ok" };
}

export function transportBadge(link) {
  if (!link) return { label: "…", tone: "neutral" };
  return TRANSPORT[link.transport] ?? TRANSPORT.none;
}

export function ageText(ms) {
  if (ms === null || ms === undefined) return "never";
  if (ms < 1500) return "just now";
  if (ms < 60_000) return `${Math.round(ms / 1000)} s ago`;
  return `${Math.round(ms / 60_000)} min ago`;
}

export function durationText(ms) {
  if (ms === null || ms === undefined) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

export function legText(leg) {
  if (!leg || leg.direction === "STOP") return "stopped";
  return `${leg.direction.toLowerCase()} ${leg.speed}%`;
}

export function headText(body) {
  if (!body) return "—";
  const target = Math.round(body.headAngle);
  if (body.headPhysicalAngle === null || body.headPhysicalAngle === undefined) return `${target}° (commanded)`;
  const physical = Math.round(body.headPhysicalAngle);
  return physical === target ? `${physical}°` : `${physical}° → ${target}°`;
}

/** Rows for the detail card. */
export function detailRows(link) {
  if (!link) return [];
  const rows = [
    ["Mode", link.mode === "simulation" ? "Simulation — brain and compiler drive a virtual robot" : "Hardware — brain and compiler drive the real ESP32"],
    ["Connection", transportBadge(link).label],
    ["Last heartbeat", ageText(link.lastHeartbeatAgoMs)],
  ];
  if (link.mode === "hardware") {
    rows.push(["WebSocket link", link.websocket ? `up for ${durationText(link.websocket.connectedForMs)}, last message ${ageText(link.websocket.lastMessageAgoMs)}${link.websocket.droppedFrames ? `, ${link.websocket.droppedFrames} frames dropped (brain busy)` : ""}` : "down"]);
  }
  if (link.body) {
    const b = link.body;
    rows.push(
      ["Head (CH0)", headText(b)],
      ["Left leg (CH1)", legText(b.leftLeg)],
      ["Right leg (CH2)", legText(b.rightLeg)],
      ["Ultrasonic", b.ultrasonicMm === null ? "no reading yet" : `${b.ultrasonicMm} mm`],
    );
    if (b.emergencyStopped) rows.push(["Emergency stop", "ACTIVE"]);
    rows.push(["Body state source", b.source === "simulator" ? "the virtual robot" : "what the server last commanded (the robot doesn't report servo positions back)"]);
  }
  return rows;
}
