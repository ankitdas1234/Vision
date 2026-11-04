import { describe, it, expect } from "vitest";
// @ts-expect-error plain JS module from the dashboard (pure functions, no React)
import { modeBadge, transportBadge, ageText, durationText, legText, headText, detailRows } from "../../../../dashboard/src/components/robot/robotLinkView.js";

const hw = (over: any = {}) => ({
  mode: "hardware", transport: "websocket", connected: true, summary: "ESP32 connected over the live WebSocket link.",
  lastHeartbeatAgoMs: 400, websocket: { connectedForMs: 125_000, lastMessageAgoMs: 300, droppedFrames: 0 },
  body: { source: "server-model", headAngle: 120, headPhysicalAngle: null, leftLeg: { direction: "STOP", speed: 0 }, rightLeg: { direction: "STOP", speed: 0 }, ultrasonicMm: 850, emergencyStopped: null },
  ...over,
});
const sim = (over: any = {}) => ({
  mode: "simulation", transport: "simulator", connected: true, summary: "Virtual robot running inside the server — no ESP32 needed.",
  lastHeartbeatAgoMs: 500, websocket: null,
  body: { source: "simulator", headAngle: 150, headPhysicalAngle: 120.4, leftLeg: { direction: "FORWARD", speed: 60 }, rightLeg: { direction: "REVERSE", speed: 60 }, ultrasonicMm: 2000, emergencyStopped: false },
  ...over,
});

describe("dashboard robot-link display", () => {
  it("mode badge makes simulation vs hardware unmistakable", () => {
    expect(modeBadge(sim())).toEqual({ label: "SIMULATION", tone: "warn" });
    expect(modeBadge(hw())).toEqual({ label: "HARDWARE", tone: "ok" });
    expect(modeBadge(null).label).toBe("…");
  });
  it("transport badge: WebSocket good, HTTP fallback a warning, offline an error, simulator neutral", () => {
    expect(transportBadge(hw())).toEqual({ label: "WebSocket live", tone: "ok" });
    expect(transportBadge(hw({ transport: "http" }))).toEqual({ label: "HTTP fallback", tone: "warn" });
    expect(transportBadge(hw({ transport: "none", connected: false }))).toEqual({ label: "Not connected", tone: "danger" });
    expect(transportBadge(sim())).toEqual({ label: "Simulator", tone: "neutral" });
    expect(transportBadge({ transport: "something-new" }).tone).toBe("danger"); // unknown never looks healthy
  });
  it("formats ages and durations humanly", () => {
    expect(ageText(null)).toBe("never"); expect(ageText(400)).toBe("just now"); expect(ageText(7000)).toBe("7 s ago"); expect(ageText(180_000)).toBe("3 min ago");
    expect(durationText(45_000)).toBe("45 s"); expect(durationText(125_000)).toBe("2 min 5 s"); expect(durationText(3_900_000)).toBe("1 h 5 min");
  });
  it("legs and head", () => {
    expect(legText({ direction: "STOP", speed: 0 })).toBe("stopped");
    expect(legText({ direction: "REVERSE", speed: 30 })).toBe("reverse 30%");
    expect(headText(hw().body)).toBe("120° (commanded)");             // hardware: only the command is known
    expect(headText(sim().body)).toBe("120° → 150°");                 // simulator: still turning toward the target
    expect(headText({ ...sim().body, headAngle: 120, headPhysicalAngle: 120 })).toBe("120°");
  });
  it("hardware rows explain the WebSocket and that body state is only 'commanded'", () => {
    const rows = Object.fromEntries(detailRows(hw()));
    expect(rows["Connection"]).toBe("WebSocket live");
    expect(rows["WebSocket link"]).toContain("up for 2 min 5 s");
    expect(rows["Head (CH0)"]).toBe("120° (commanded)");
    expect(rows["Ultrasonic"]).toBe("850 mm");
    expect(rows["Body state source"]).toMatch(/last commanded/);
  });
  it("HTTP fallback shows the WebSocket as down; dropped frames are surfaced", () => {
    expect(Object.fromEntries(detailRows(hw({ transport: "http", websocket: null })))["WebSocket link"]).toBe("down");
    expect(Object.fromEntries(detailRows(hw({ websocket: { connectedForMs: 1000, lastMessageAgoMs: 100, droppedFrames: 4 } })))["WebSocket link"]).toContain("4 frames dropped");
  });
  it("simulation rows show the virtual robot and have no WebSocket row", () => {
    const rows = Object.fromEntries(detailRows(sim()));
    expect(rows["WebSocket link"]).toBeUndefined();
    expect(rows["Left leg (CH1)"]).toBe("forward 60%");
    expect(rows["Right leg (CH2)"]).toBe("reverse 60%");
    expect(rows["Body state source"]).toBe("the virtual robot");
  });
  it("emergency stop and 'no reading yet' are shown", () => {
    const rows = Object.fromEntries(detailRows(sim({ body: { ...sim().body, emergencyStopped: true, ultrasonicMm: null } })));
    expect(rows["Emergency stop"]).toBe("ACTIVE");
    expect(rows["Ultrasonic"]).toBe("no reading yet");
  });
  it("renders nothing for a missing status instead of crashing", () => { expect(detailRows(null)).toEqual([]); });
});
