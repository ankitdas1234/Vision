import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../src/camera/CameraService", () => ({ cameraService: { capture: vi.fn(async () => ({})) } }));
vi.mock("../../../src/robot/heartbeat", () => ({ ingestHeartbeat: vi.fn() }));

import { SimulatedRobot } from "../../../src/robot/SimulatedRobot";
import { pendingCommandQueue } from "../../../src/commands/PendingCommandQueue";
import { setPendingSpeech } from "../../../src/audio/PendingSpeechCache";
import { ingestHeartbeat } from "../../../src/robot/heartbeat";

let sim: SimulatedRobot;
const ID = "vision-001";

beforeEach(() => { sim = new SimulatedRobot(); sim.start(ID); });
afterEach(() => { sim.stop(); vi.useRealTimers(); });

describe("SimulatedRobot (ROBOT_MODE=simulation end of the pipeline)", () => {
  it("receives commands the instant the brain/compiler queues them and applies them to the virtual body", () => {
    pendingCommandQueue.enqueue(ID, "c1", "EYE_SET", { angle: 30 });
    pendingCommandQueue.enqueue(ID, "c2", "WALK_FORWARD", {});
    expect(pendingCommandQueue.pendingCount(ID)).toBe(0); // consumed, not left queued
    expect(sim.state.headAngle).toBe(30);
    expect(sim.state.leftLeg).toEqual({ direction: "FORWARD", speed: 60 });
    expect(sim.state.rightLeg).toEqual({ direction: "FORWARD", speed: 60 });
    expect(sim.state.commandsReceived).toBe(2);
  });

  it("looks around independently of the legs (head and legs are separate servos)", () => {
    pendingCommandQueue.enqueue(ID, "c1", "WALK_FORWARD", {});
    pendingCommandQueue.enqueue(ID, "c2", "EYE_RIGHT", { step: 40 });
    expect(sim.state.headAngle).toBe(130);
    expect(sim.state.leftLeg.direction).toBe("FORWARD"); // walking was not interrupted
  });

  it("clamps the head to 0-180", () => {
    pendingCommandQueue.enqueue(ID, "c1", "EYE_SET", { angle: 170 });
    pendingCommandQueue.enqueue(ID, "c2", "EYE_RIGHT", { step: 90 });
    expect(sim.state.headAngle).toBe(180);
    pendingCommandQueue.enqueue(ID, "c3", "EYE_SET", { angle: 10 });
    pendingCommandQueue.enqueue(ID, "c4", "EYE_LEFT", { step: 90 });
    expect(sim.state.headAngle).toBe(0);
  });

  it("turns the body by driving the legs in opposite directions", () => {
    pendingCommandQueue.enqueue(ID, "c1", "TURN_LEFT", {});
    expect(sim.state.leftLeg.direction).toBe("REVERSE");
    expect(sim.state.rightLeg.direction).toBe("FORWARD");
  });

  it("stops by itself after a bounded walk", () => {
    vi.useFakeTimers();
    pendingCommandQueue.enqueue(ID, "c1", "WALK_FORWARD", { durationMs: 500 });
    expect(sim.state.leftLeg.direction).toBe("FORWARD");
    vi.advanceTimersByTime(600);
    expect(sim.state.leftLeg.direction).toBe("STOP");
  });

  it("emergency stop halts the legs and recentres the head; clear releases it", () => {
    pendingCommandQueue.enqueue(ID, "c1", "EYE_SET", { angle: 20 });
    pendingCommandQueue.enqueue(ID, "c2", "WALK_FORWARD", {});
    pendingCommandQueue.enqueue(ID, "c3", "EMERGENCY_STOP", {});
    expect(sim.state.leftLeg.direction).toBe("STOP");
    expect(sim.state.headAngle).toBe(90);
    expect(sim.state.emergencyStopped).toBe(true);
    pendingCommandQueue.enqueue(ID, "c4", "EMERGENCY_CLEAR", {});
    expect(sim.state.emergencyStopped).toBe(false);
  });

  it("'plays' speech sent by the brain", () => {
    const pcm = Buffer.alloc(32000); // 1 s of 16 kHz PCM16
    setPendingSpeech(ID, { audioBase64: pcm.toString("base64"), mimeType: "audio/pcm", format: "pcm16", sampleRateHz: 16000 });
    expect(sim.state.speechPlayed).toBe(1);
    expect(sim.state.lastSpeechSeconds).toBe(1);
  });

  it("sends heartbeats carrying the simulated ultrasonic reading, and obstacles show up immediately", () => {
    sim.setUltrasonicMm(120);
    expect(ingestHeartbeat).toHaveBeenLastCalledWith(
      expect.objectContaining({ mockMode: true, ultrasonicRawDistanceMm: 120 }),
      expect.anything(),
    );
  });

  it("flushes commands queued before it started", () => {
    sim.stop();
    pendingCommandQueue.enqueue(ID, "early", "EYE_SET", { angle: 55 });
    const fresh = new SimulatedRobot();
    fresh.start(ID);
    expect(fresh.state.headAngle).toBe(55);
    fresh.stop();
  });
});

// ------------------------------------------------------------------------------
// Physics + renderer feed (the 3D client draws exactly this)
// ------------------------------------------------------------------------------
import { MAX_SPEED_MPS, MAX_TURN_DEG_PER_S, HEAD_MAX_DEG_PER_SEC } from "../../../src/robot/SimulatedRobot";
import { resetForwardReading } from "../../../src/ultrasonic/UltrasonicController";
import { servoManager } from "../../../src/servos/ServoManager";
import { centerHead } from "../../../src/attention/HeadController";

describe("SimulatedRobot body physics", () => {
  const advance = (seconds: number) => {
    const t0 = Date.now();
    for (let i = 1; i <= seconds * 20; i++) sim.step(t0 + i * 50);
  };
  beforeEach(() => { centerHead(servoManager); resetForwardReading(); });

  it("walking forward moves along +z at the configured speed", () => {
    pendingCommandQueue.enqueue(ID, "w", "WALK_FORWARD", {});
    advance(2);
    expect(sim.state.pose.z).toBeCloseTo(2 * 0.6 * MAX_SPEED_MPS, 1); // legs run at 60%
    expect(sim.state.pose.x).toBeCloseTo(0, 5);
    expect(sim.state.pose.headingDeg).toBeCloseTo(0, 5);
  });

  it("walking backward moves the other way", () => {
    pendingCommandQueue.enqueue(ID, "w", "WALK_BACKWARD", {});
    advance(1);
    expect(sim.state.pose.z).toBeLessThan(0);
  });

  it("turning right (legs opposite) rotates clockwise in place and does not translate", () => {
    pendingCommandQueue.enqueue(ID, "t", "TURN_RIGHT", {});
    advance(1);
    expect(sim.state.pose.headingDeg).toBeCloseTo(0.6 * MAX_TURN_DEG_PER_S, 0);
    expect(Math.hypot(sim.state.pose.x, sim.state.pose.z)).toBeLessThan(1e-6);
  });

  it("turning left decreases heading (wraps into 0-360)", () => {
    pendingCommandQueue.enqueue(ID, "t", "TURN_LEFT", {});
    advance(1);
    expect(sim.state.pose.headingDeg).toBeGreaterThan(180); // 360 - ~54
  });

  it("after turning right ~90 degrees, walking forward heads toward -x (the robot's right when it started facing +z)", () => {
    pendingCommandQueue.enqueue(ID, "t", "TURN_RIGHT", {});
    advance(90 / (0.6 * MAX_TURN_DEG_PER_S));
    pendingCommandQueue.enqueue(ID, "s", "WALK_STOP", {});
    pendingCommandQueue.enqueue(ID, "w", "WALK_FORWARD", {});
    advance(2);
    expect(Math.abs(sim.state.pose.headingDeg - 90)).toBeLessThan(2); // 20 Hz steps -> within a couple of degrees
    expect(sim.state.pose.x).toBeLessThan(-0.1);
    expect(Math.abs(sim.state.pose.z)).toBeLessThan(0.02);
  });

  it("the head eases toward its target at the firmware's speed instead of snapping", () => {
    pendingCommandQueue.enqueue(ID, "h", "EYE_SET", { angle: 0 });
    expect(sim.state.headAngle).toBe(0);               // commanded target is immediate
    expect(sim.state.headPhysicalAngle).toBe(90);      // physical head hasn't moved yet
    advance(0.25);
    expect(sim.state.headPhysicalAngle).toBeCloseTo(90 - HEAD_MAX_DEG_PER_SEC * 0.25, 0);
    advance(1);
    expect(sim.state.headPhysicalAngle).toBeCloseTo(0, 1);
  });

  it("can turn the head while walking — head and legs are independent", () => {
    pendingCommandQueue.enqueue(ID, "w", "WALK_FORWARD", {});
    pendingCommandQueue.enqueue(ID, "h", "EYE_SET", { angle: 150 });
    advance(1);
    expect(sim.state.pose.z).toBeGreaterThan(0.05);   // kept walking
    expect(sim.state.headPhysicalAngle).toBeCloseTo(150, 1);
  });

  it("stops the legs on-device when the ultrasonic sensor reports an obstacle (head forward)", async () => {
    const { ultrasonicService } = await import("../../../src/ultrasonic/UltrasonicService");
    for (let i = 0; i < 20; i++) ultrasonicService.ingest(100); // settle the filter on "very close"
    pendingCommandQueue.enqueue(ID, "w", "WALK_FORWARD", {});
    advance(0.2);
    expect(sim.state.leftLeg.direction).toBe("STOP");
    expect(sim.state.rightLeg.direction).toBe("STOP");
    for (let i = 0; i < 20; i++) ultrasonicService.ingest(2000); // leave it clear for other tests
  });

  it("emits state events for the renderer, and speech text for AUDIO_SPEAK", () => {
    const states: any[] = [];
    const speeches: any[] = [];
    sim.on("state", (s) => states.push(s));
    sim.on("speech", (s) => speeches.push(s));
    pendingCommandQueue.enqueue(ID, "w", "WALK_FORWARD", {});
    advance(0.2);
    pendingCommandQueue.enqueue(ID, "say", "AUDIO_SPEAK", { text: "Hello there" });
    expect(states.length).toBeGreaterThan(0);
    expect(states.at(-1)).toMatchObject({ mode: "simulation", leftLeg: { direction: "FORWARD" } });
    expect(states.at(-1).pose.z).toBeGreaterThan(0);
    expect(speeches).toEqual([{ text: "Hello there" }]);
  });
});
