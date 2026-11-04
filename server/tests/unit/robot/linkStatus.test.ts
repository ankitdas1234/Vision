import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../src/config/env", async (orig) => {
  const actual = await orig<typeof import("../../../src/config/env")>();
  return { env: { ...actual.env, ROBOT_MODE: "hardware" as "hardware" | "simulation" } };
});
vi.mock("../../../src/camera/CameraService", () => ({ cameraService: { capture: async () => ({}) } }));

const { env } = await import("../../../src/config/env");
const { getRobotLinkStatus } = await import("../../../src/robot/linkStatus");
const { robotConnection } = await import("../../../src/robot/RobotConnection");
const { robotLink } = await import("../../../src/robot/RobotLink");
const { simulatedRobot } = await import("../../../src/robot/SimulatedRobot");
const { ultrasonicService } = await import("../../../src/ultrasonic/UltrasonicService");
const { setHeadAngle, centerHead } = await import("../../../src/attention/HeadController");
const { servoManager } = await import("../../../src/servos/ServoManager");

const setMode = (m: "hardware" | "simulation") => { (env as any).ROBOT_MODE = m; };
const setHeartbeatAgo = (ms: number | null) => { (robotConnection as any).lastHeartbeatAt = ms === null ? null : Date.now() - ms; };

beforeEach(() => { setMode("hardware"); setHeartbeatAgo(null); vi.restoreAllMocks(); centerHead(servoManager); });
afterEach(() => { simulatedRobot.stop(); setMode("hardware"); });

describe("robot link status shown on the dashboard — hardware mode", () => {
  it("WebSocket up: transport websocket, connected, with link details", () => {
    vi.spyOn(robotLink, "info").mockReturnValue({ connectedForMs: 5000, lastMessageAgoMs: 120, droppedFrames: 2 });
    setHeartbeatAgo(300);
    const s = getRobotLinkStatus();
    expect(s).toMatchObject({ mode: "hardware", transport: "websocket", connected: true });
    expect(s.websocket).toEqual({ connectedForMs: 5000, lastMessageAgoMs: 120, droppedFrames: 2 });
    expect(s.summary).toMatch(/WebSocket/i);
  });

  it("WebSocket down but heartbeats arriving over HTTP: transport http (the slow fallback), still connected", () => {
    vi.spyOn(robotLink, "info").mockReturnValue(null);
    setHeartbeatAgo(2000);
    const s = getRobotLinkStatus();
    expect(s).toMatchObject({ transport: "http", connected: true, websocket: null });
    expect(s.summary).toMatch(/HTTP/i);
  });

  it("no WebSocket and a stale heartbeat: not connected", () => {
    vi.spyOn(robotLink, "info").mockReturnValue(null);
    setHeartbeatAgo(20_000);
    expect(getRobotLinkStatus()).toMatchObject({ transport: "none", connected: false });
  });

  it("no WebSocket and no heartbeat ever: not connected, and no body state is shown for a robot that isn't there", () => {
    vi.spyOn(robotLink, "info").mockReturnValue(null);
    expect(getRobotLinkStatus()).toMatchObject({ transport: "none", connected: false, body: null });
  });

  it("reports what the server last COMMANDED, labelled as such (the firmware doesn't report servo positions back)", () => {
    vi.spyOn(robotLink, "info").mockReturnValue(null);
    setHeartbeatAgo(100);
    setHeadAngle(140, servoManager);
    const b = getRobotLinkStatus().body!;
    expect(b.source).toBe("server-model");
    expect(b.headAngle).toBe(140);
    expect(b.headPhysicalAngle).toBeNull();
    expect(b.leftLeg.direction).toBe("STOP");
    expect(b.emergencyStopped).toBeNull();
  });

  it("shows the last real ultrasonic reading, and null (not a fabricated one) when there has been none", () => {
    vi.spyOn(robotLink, "info").mockReturnValue(null);
    setHeartbeatAgo(200); // a robot must be reachable for there to be a body to report
    vi.spyOn(ultrasonicService, "getLast").mockReturnValue(null);
    expect(getRobotLinkStatus().body!.ultrasonicMm).toBeNull();
    vi.spyOn(ultrasonicService, "getLast").mockReturnValue({ filteredDistanceMm: 432.4 } as any);
    expect(getRobotLinkStatus().body!.ultrasonicMm).toBe(432);
  });
});

describe("robot link status — simulation mode", () => {
  it("virtual robot running: transport simulator, with the simulator's REAL body state", () => {
    setMode("simulation");
    simulatedRobot.start("vision-001");
    const s = getRobotLinkStatus();
    expect(s).toMatchObject({ mode: "simulation", transport: "simulator", connected: true, websocket: null });
    expect(s.body).toMatchObject({ source: "simulator", headAngle: 90, emergencyStopped: false });
    expect(s.body!.headPhysicalAngle).not.toBeNull();
    expect(s.summary).toMatch(/virtual robot/i);
  });

  it("virtual robot stopped: not connected", () => {
    setMode("simulation");
    expect(getRobotLinkStatus()).toMatchObject({ mode: "simulation", transport: "none", connected: false, body: null });
  });

  it("simulation ignores any stale WebSocket/heartbeat state", () => {
    setMode("simulation");
    simulatedRobot.start("vision-001");
    vi.spyOn(robotLink, "info").mockReturnValue({ connectedForMs: 1, lastMessageAgoMs: 1, droppedFrames: 0 });
    expect(getRobotLinkStatus().transport).toBe("simulator");
  });
});

describe("system health: robot link row", () => {
  it("hardware + WebSocket = OK, HTTP fallback = DEGRADED, nothing = DOWN; simulation = MOCK", async () => {
    vi.doMock("../../../src/database/client", () => ({ db: { execute: async () => [] } }));
    const { systemHealthService } = await import("../../../src/system/SystemHealthService");
    const row = async () => (await systemHealthService.run()).subsystems.find((x) => x.key === "robotConnection")!;

    vi.spyOn(robotLink, "info").mockReturnValue({ connectedForMs: 1, lastMessageAgoMs: 1, droppedFrames: 0 });
    expect((await row()).status).toBe("OK");
    vi.spyOn(robotLink, "info").mockReturnValue(null); setHeartbeatAgo(500);
    expect((await row()).status).toBe("DEGRADED");
    setHeartbeatAgo(60_000);
    expect((await row()).status).toBe("DOWN");
    setMode("simulation"); simulatedRobot.start("vision-001");
    const sim = await row();
    expect(sim.status).toBe("MOCK");
    expect((await systemHealthService.run()).robotMode).toBe("simulation");
  });
});
