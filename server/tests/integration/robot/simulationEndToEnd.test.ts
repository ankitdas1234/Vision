import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// Real CommandRegistry -> real CommandExecutor -> real PendingCommandQueue -> SimulatedRobot.
// Only the database-backed bits (audit log, restrictions, control-mode flag) and the camera are stubbed.
vi.mock("../../../src/camera/CameraService", () => ({ cameraService: { capture: async () => ({}) } }));
vi.mock("../../../src/robot/heartbeat", () => ({ ingestHeartbeat: () => undefined }));
// Control mode is DB-backed; direct commands/scripts are only allowed in MANUAL mode, so the
// test flips the same switch an operator would — and a separate test proves AUTONOMOUS still blocks scripts.
let manual = true;
vi.mock("../../../src/control/ControlMode", async (orig) => {
  const actual = await orig<typeof import("../../../src/control/ControlMode")>();
  return { ...actual, controlMode: { isManualModeEnabled: async () => manual, mode: async () => (manual ? "MANUAL" : "AUTONOMOUS") } };
});

const { commandRegistry } = await import("../../../src/commands/CommandRegistry");
const { simulatedRobot } = await import("../../../src/robot/SimulatedRobot");
const { servoManager } = await import("../../../src/servos/ServoManager");
const { centerHead } = await import("../../../src/attention/HeadController");
const { resetForwardReading } = await import("../../../src/ultrasonic/UltrasonicController");

const ROBOT = "vision-001";
const dispatch = (type: string, params: Record<string, unknown> = {}, source = "AI") =>
  commandRegistry.dispatch({ type: type as never, params, source: source as never, robotId: ROBOT, isAdmin: true });

beforeAll(() => simulatedRobot.start(ROBOT));
afterAll(() => simulatedRobot.stop());
beforeEach(async () => { manual = true; centerHead(servoManager); resetForwardReading(); });

describe("ROBOT_MODE=simulation: brain/compiler commands reach the virtual robot", () => {
  it("EYE_SET (the head servo) moves the virtual head", async () => {
    await dispatch("EYE_SET", { angle: 140 });
    expect(simulatedRobot.state.headAngle).toBe(140);
    await dispatch("EYE_CENTER");
    expect(simulatedRobot.state.headAngle).toBe(90);
  });

  it("LEFT/RIGHT_LEG_ROTATE drive the two leg servos independently", async () => {
    await dispatch("LEFT_LEG_ROTATE", { speed: 50 });
    await dispatch("RIGHT_LEG_ROTATE", { speed: -30 });
    expect(simulatedRobot.state.leftLeg).toEqual({ direction: "FORWARD", speed: 50 });
    expect(simulatedRobot.state.rightLeg).toEqual({ direction: "REVERSE", speed: 30 });
    await dispatch("LEFT_LEG_STOP"); await dispatch("RIGHT_LEG_STOP");
    expect(simulatedRobot.state.leftLeg.direction).toBe("STOP");
  });

  it("the old leg-joint commands are gone (3 servos only)", async () => {
    const result = await dispatch("LEFT_LEG_JOINT", { angle: 90 });
    expect(result.success).toBe(false);
  });

  it("a compiled Vision Script drives the head and legs of the virtual robot", async () => {
    const { scriptService } = await import("../../../src/scripts/ScriptService");
    const out = await scriptService.compileAndExecute(
      ["WALK_FORWARD 50", "EYE_SET 25", 'AUDIO_SPEAK "script says hi"', "WAIT 80", "WALK_STOP"].join("\n"),
      ROBOT,
      true,
    );
    expect(out.compiled.success).toBe(true);
    expect(simulatedRobot.state.headAngle).toBe(25);                       // head servo moved by the script (a glance while walking)
    expect(simulatedRobot.state.commandsReceived).toBeGreaterThanOrEqual(4); // everything arrived at the virtual robot
    expect(simulatedRobot.state.leftLeg.direction).toBe("STOP");           // WALK_STOP landed last
  });

  it("a script that looks sideways and THEN walks gets the head brought forward first (safety rule)", async () => {
    const { scriptService } = await import("../../../src/scripts/ScriptService");
    const seen: string[] = [];
    const onState = (s: any) => { if (s.lastCommand && seen.at(-1) !== s.lastCommand.type) seen.push(s.lastCommand.type); };
    simulatedRobot.on("state", onState);
    await scriptService.compileAndExecute(["EYE_SET 25", "WALK_FORWARD 50"].join("\n"), ROBOT, true);
    await new Promise((r) => setTimeout(r, 120));
    simulatedRobot.off("state", onState);
    expect(seen.indexOf("EYE_SET")).toBeLessThan(seen.indexOf("EYE_CENTER"));
    expect(seen.indexOf("EYE_CENTER")).toBeLessThan(seen.indexOf("WALK_FORWARD"));
    expect(simulatedRobot.state.headAngle).toBe(90);
  });

  it("scripts are still refused in AUTONOMOUS mode — the simulator doesn't weaken safety rules", async () => {
    manual = false;
    const { scriptService } = await import("../../../src/scripts/ScriptService");
    const before = simulatedRobot.state.commandsReceived;
    const out = await scriptService.compileAndExecute("EYE_SET 40", ROBOT, true);
    expect(out.executionResults[0].result.status).toBe("REJECTED");
    expect(simulatedRobot.state.commandsReceived).toBe(before);
  });

  it("the compiler rejects commands that no longer exist", async () => {
    const { Compiler } = await import("../../../src/compiler/Compiler");
    expect(new Compiler().compile("LEFT_LEG_JOINT 90").success).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------
// Head <-> legs interplay (the ultrasonic sensor rides on the head)
// ---------------------------------------------------------------------------------------
describe("moving the legs looks forward first", () => {
  it("a walk command while the head is turned away centres the head first, then walks", async () => {
    await dispatch("EYE_SET", { angle: 150 });
    expect(simulatedRobot.state.headAngle).toBe(150);
    const seen: string[] = [];
    simulatedRobot.on("state", (s: any) => { if (s.lastCommand && seen.at(-1) !== s.lastCommand.type) seen.push(s.lastCommand.type); });

    const result = await dispatch("WALK_FORWARD", { durationMs: 50 });
    expect(result.success).toBe(true);
    expect(simulatedRobot.state.headAngle).toBe(90);                        // head was brought forward
    await new Promise((r) => setTimeout(r, 120));
    expect(seen.indexOf("EYE_CENTER")).toBeGreaterThanOrEqual(0);
    expect(seen.indexOf("EYE_CENTER")).toBeLessThan(seen.indexOf("WALK_FORWARD")); // in that order
    await dispatch("WALK_STOP");
  });

  it("waits for the physical head to arrive before sending the leg command (firmware rejects movement until it's forward)", async () => {
    const { headSettleRemainingMs } = await import("../../../src/attention/HeadController");
    await dispatch("EYE_SET", { angle: 170 });
    expect(headSettleRemainingMs()).toBeGreaterThan(100);                   // head is still travelling
    const t0 = Date.now();
    await dispatch("TURN_LEFT", { durationMs: 200 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(250);                    // 170 -> 90 at 240 deg/s ~ 333 ms
    expect(headSettleRemainingMs()).toBe(0);
    await dispatch("WALK_STOP");
  });

  it("a walk with the head already forward is not delayed", async () => {
    await dispatch("EYE_CENTER");
    const { waitForHeadSettled } = await import("../../../src/attention/HeadController");
    await waitForHeadSettled();
    const t0 = Date.now();
    await dispatch("WALK_FORWARD", { durationMs: 50 });
    // The server models a walk in 400 ms gait phases, so ~400 ms is the baseline; a head wait would add ~250+ ms on top.
    expect(Date.now() - t0).toBeLessThan(600);
    await dispatch("WALK_STOP");
  });
});
