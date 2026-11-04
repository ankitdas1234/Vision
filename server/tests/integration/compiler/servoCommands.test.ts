import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// Every servo command, written the way a user writes it in Vision Script, compiled by the REAL compiler and
// run through the REAL CommandRegistry onto the simulated robot. Only the DB-backed control-mode flag and the
// camera are stubbed.
vi.mock("../../../src/camera/CameraService", () => ({ cameraService: { capture: async () => ({}) } }));
vi.mock("../../../src/robot/heartbeat", () => ({ ingestHeartbeat: () => undefined }));
vi.mock("../../../src/control/ControlMode", async (orig) => {
  const actual = await orig<typeof import("../../../src/control/ControlMode")>();
  return { ...actual, controlMode: { isManualModeEnabled: async () => true, mode: async () => "MANUAL" } };
});

const { scriptService } = await import("../../../src/scripts/ScriptService");
const { simulatedRobot } = await import("../../../src/robot/SimulatedRobot");
const { servoManager } = await import("../../../src/servos/ServoManager");
const { centerHead, resetHeadSettle } = await import("../../../src/attention/HeadController");
const { resetForwardReading } = await import("../../../src/ultrasonic/UltrasonicController");
const { Compiler } = await import("../../../src/compiler/Compiler");
const { COMMAND_TYPES } = await import("../../../src/packages/types");

const ROBOT = "vision-001";
const run = (src: string) => scriptService.compileAndExecute(src, ROBOT, true);
const st = () => simulatedRobot.state;

beforeAll(() => simulatedRobot.start(ROBOT));
afterAll(() => simulatedRobot.stop());
beforeEach(async () => {
  centerHead(servoManager); resetHeadSettle(); resetForwardReading();
  await run("WALK_STOP\nLEFT_LEG_STOP\nRIGHT_LEG_STOP\nEYE_CENTER");
});

describe("head commands (CH0)", () => {
  it("EYE_SET <angle> sets the head angle across the whole 0-180 range", async () => {
    for (const a of [0, 45, 90, 135, 180]) {
      const out = await run(`EYE_SET ${a}`);
      expect(out.compiled.success).toBe(true);
      expect(out.executionResults.at(-1)!.result).toMatchObject({ success: true });
      expect(st().headAngle).toBe(a);
    }
  });
  it("EYE_LEFT / EYE_RIGHT <step> nudge the head relative to where it is", async () => {
    await run("EYE_SET 90\nEYE_RIGHT 30");
    expect(st().headAngle).toBe(120);
    await run("EYE_LEFT 50");
    expect(st().headAngle).toBe(70);
  });
  it("EYE_LEFT / EYE_RIGHT with no step use the default 10 degrees", async () => {
    await run("EYE_SET 90\nEYE_RIGHT");
    expect(st().headAngle).toBe(100);
  });
  it("EYE_CENTER returns to 90", async () => {
    await run("EYE_SET 20\nEYE_CENTER");
    expect(st().headAngle).toBe(90);
  });
  it("EYE_TRACK_PERSON <angle> points the head at that bearing (the arg used to be silently dropped)", async () => {
    const out = await run("EYE_TRACK_PERSON 120");
    expect(out.executionResults[0].result).toMatchObject({ success: true });
    expect(st().headAngle).toBe(120);
  });
  it("variables, arithmetic and loops drive the head (a real sweep)", async () => {
    const seen: number[] = [];
    const onCmd = (c: any) => { if (c.type === "EYE_SET") seen.push(c.params.angle); };
    simulatedRobot.on("command", onCmd);
    await run(["REPEAT 4 TIMES AS $i", "  SET $a $i * 40 + 30", "  EYE_SET $a", "  WAIT 30", "END"].join("\n"));
    simulatedRobot.off("command", onCmd);
    expect(seen).toEqual([30, 70, 110, 150]);
  });
});

describe("leg commands (CH1 left, CH2 right)", () => {
  it("LEFT_LEG_FORWARD / REVERSE / ROTATE / STOP drive only the left leg", async () => {
    await run("LEFT_LEG_FORWARD 40");
    expect(st().leftLeg).toEqual({ direction: "FORWARD", speed: 40 });
    expect(st().rightLeg.direction).toBe("STOP");
    await run("LEFT_LEG_REVERSE 25");
    expect(st().leftLeg).toEqual({ direction: "REVERSE", speed: 25 });
    await run("LEFT_LEG_ROTATE -60");
    expect(st().leftLeg).toEqual({ direction: "REVERSE", speed: 60 });
    await run("LEFT_LEG_ROTATE 70");
    expect(st().leftLeg).toEqual({ direction: "FORWARD", speed: 70 });
    await run("LEFT_LEG_STOP");
    expect(st().leftLeg.direction).toBe("STOP");
  });
  it("RIGHT_LEG_FORWARD / REVERSE / ROTATE / STOP drive only the right leg", async () => {
    await run("RIGHT_LEG_FORWARD 40");
    expect(st().rightLeg).toEqual({ direction: "FORWARD", speed: 40 });
    expect(st().leftLeg.direction).toBe("STOP");
    await run("RIGHT_LEG_REVERSE 25");
    expect(st().rightLeg).toEqual({ direction: "REVERSE", speed: 25 });
    await run("RIGHT_LEG_ROTATE -60");
    expect(st().rightLeg).toEqual({ direction: "REVERSE", speed: 60 });
    await run("RIGHT_LEG_STOP");
    expect(st().rightLeg.direction).toBe("STOP");
  });
  it("two leg commands in one script make the legs move independently (e.g. a turn built by hand)", async () => {
    await run("LEFT_LEG_ROTATE 50\nRIGHT_LEG_ROTATE -50");
    expect(st().leftLeg.direction).toBe("FORWARD");
    expect(st().rightLeg.direction).toBe("REVERSE");
  });
});

describe("gait commands", () => {
  it("WALK_FORWARD / WALK_BACKWARD <ms> run both legs for that long, then stop", async () => {
    const dirs: string[] = [];
    const onState = (s: any) => dirs.push(`${s.leftLeg.direction}/${s.rightLeg.direction}`);
    simulatedRobot.on("state", onState);
    await run("WALK_FORWARD 150");
    await run("WALK_BACKWARD 150");
    await new Promise((r) => setTimeout(r, 250));
    simulatedRobot.off("state", onState);
    expect(dirs).toContain("FORWARD/FORWARD");
    expect(dirs).toContain("REVERSE/REVERSE");
    expect(st().leftLeg.direction).toBe("STOP"); // the bounded walk ended by itself
  });
  it("TURN_LEFT drives left-reverse / right-forward, TURN_RIGHT the opposite", async () => {
    const dirs = new Set<string>();
    const onState = (s: any) => dirs.add(`${s.leftLeg.direction}/${s.rightLeg.direction}`);
    simulatedRobot.on("state", onState);
    await run("TURN_LEFT 100");
    await run("TURN_RIGHT 100");
    simulatedRobot.off("state", onState);
    expect(dirs.has("REVERSE/FORWARD")).toBe(true);
    expect(dirs.has("FORWARD/REVERSE")).toBe(true);
  });
  it("WALK_FORWARD with no argument runs until WALK_STOP", async () => {
    // (the server's own model of an open-ended walk is bounded; the robot/simulator keep going until told to stop)
    void run("WALK_FORWARD");
    await new Promise((r) => setTimeout(r, 700));
    expect(st().leftLeg.direction).toBe("FORWARD");
    await run("WALK_STOP");
    expect(st().leftLeg.direction).toBe("STOP");
  });
  it("a turn moves the body around: the heading actually changes", async () => {
    const before = st().pose.headingDeg;
    await run("TURN_RIGHT 400");
    await new Promise((r) => setTimeout(r, 450));
    simulatedRobot.step(Date.now());
    expect(Math.abs(st().pose.headingDeg - before)).toBeGreaterThan(1);
  });
});

describe("safety commands", () => {
  it("scripts can NOT issue admin-only safety commands: compiler accepts the name, the registry refuses it, nothing reaches the robot", async () => {
    for (const cmd of ["SERVOS_SAFE", "EMERGENCY_STOP", 'EMERGENCY_CLEAR "all good"', "ULTRASONIC_DISABLE"]) {
      await run("EYE_SET 150");
      const before = st().commandsReceived;
      const out = await run(`${cmd}\nLEFT_LEG_ROTATE 30`);
      expect(out.compiled.success).toBe(true);
      expect(out.executionResults).toHaveLength(1);
      expect(out.executionResults[0].result).toMatchObject({ success: false });
      // (EMERGENCY_CLEAR needs a `reason` field a bare script argument can't supply, so it fails schema validation first —
      // refused either way. The others are refused for being admin-only.)
      if (!cmd.startsWith("EMERGENCY_CLEAR")) expect(out.executionResults[0].result).toMatchObject({ error: { code: "PERMISSION_DENIED" } });
      expect(st().commandsReceived).toBe(before);
      expect(st().headAngle).toBe(150);
    }
  });
  it("an admin using the dashboard/API CAN issue SERVOS_SAFE: legs stop and the head recentres", async () => {
    const { commandRegistry } = await import("../../../src/commands/CommandRegistry");
    await run("EYE_SET 150\nLEFT_LEG_ROTATE 50");
    const r = await commandRegistry.dispatch({ type: "SERVOS_SAFE", params: {}, source: "DASHBOARD", robotId: ROBOT, isAdmin: true });
    expect(r.success).toBe(true);
    expect(st().headAngle).toBe(90);
    expect(st().leftLeg.direction).toBe("STOP");
  });
});

describe("bad arguments fail loudly and stop the script (nothing after them runs)", () => {
  const cases: [string, string][] = [
    ["EYE_SET 181", "head angle above 180"],
    ["EYE_SET -1", "head angle below 0"],
    ["EYE_RIGHT 0", "head step below 1"],
    ["EYE_LEFT 91", "head step above 90"],
    ["LEFT_LEG_ROTATE 101", "leg speed above 100"],
    ["RIGHT_LEG_ROTATE -101", "leg speed below -100"],
    ["LEFT_LEG_FORWARD -5", "negative forward speed"],
    ["WALK_FORWARD 60001", "walk longer than 60 s"],
    ["EYE_TRACK_PERSON 181", "track bearing above 180"],
  ];
  it.each(cases)("%s  (%s)", async (line) => {
    const before = st().commandsReceived;
    const out = await run(`${line}\nLEFT_LEG_ROTATE 30`);
    expect(out.compiled.success).toBe(true);                                  // the compiler doesn't know ranges...
    expect(out.executionResults).toHaveLength(1);                            // ...the registry rejects it and the script stops
    expect(out.executionResults[0].result).toMatchObject({ success: false });
    expect(st().commandsReceived).toBe(before);                              // nothing reached the robot, including the next line
  });
  it("EYE_SET with no angle is rejected (angle is required)", async () => {
    const out = await run("EYE_SET");
    expect(out.executionResults[0].result).toMatchObject({ success: false });
  });
});

describe("the removed leg-joint commands", () => {
  it.each(["LEFT_LEG_JOINT 90", "RIGHT_LEG_JOINT 90", "LEFT_LEG_CENTER", "RIGHT_LEG_CENTER"])("%s is a compile error that names the command", (line) => {
    const r = new Compiler().compile(line);
    expect(r.success).toBe(false);
    expect(r.diagnostics[0]).toMatchObject({ code: "UNKNOWN_COMMAND" });
    expect(r.diagnostics[0].message).toContain(line.split(" ")[0]);
  });
  it("none of them are in the command list any more", () => {
    for (const c of ["LEFT_LEG_JOINT", "RIGHT_LEG_JOINT", "LEFT_LEG_CENTER", "RIGHT_LEG_CENTER"]) expect(COMMAND_TYPES).not.toContain(c as never);
  });
});

describe("every servo command in the command list is covered above", () => {
  it("lists exactly the servo commands that exist", () => {
    const servoCommands = COMMAND_TYPES.filter((c) => /^(EYE_|LEFT_LEG_|RIGHT_LEG_|WALK_|TURN_)/.test(c)).sort();
    expect(servoCommands).toEqual([
      "EYE_CENTER", "EYE_LEFT", "EYE_RIGHT", "EYE_SET", "EYE_TRACK_PERSON",
      "LEFT_LEG_FORWARD", "LEFT_LEG_REVERSE", "LEFT_LEG_ROTATE", "LEFT_LEG_STOP",
      "RIGHT_LEG_FORWARD", "RIGHT_LEG_REVERSE", "RIGHT_LEG_ROTATE", "RIGHT_LEG_STOP",
      "TURN_LEFT", "TURN_RIGHT", "WALK_BACKWARD", "WALK_FORWARD", "WALK_STOP",
    ].sort());
  });
});

// ---------------------------------------------------------------------------------------
// The examples in docs/vision-script.md don't just compile — they RUN, and do what the docs say.
// ---------------------------------------------------------------------------------------
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("examples in docs/vision-script.md run on the virtual robot", () => {
  const md = readFileSync(join(__dirname, "../../../../docs/vision-script.md"), "utf-8");
  const section = md.slice(md.indexOf("## Controlling the head and legs"), md.indexOf("## Commands available to scripts"));
  const examples = [...section.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]);
  const byFirstLine = (needle: string) => examples.find((e) => e.startsWith(needle))!;

  it("finds the five documented examples", () => expect(examples).toHaveLength(5));

  it("every step of every example is accepted and run", async () => {
    for (const src of examples) {
      const out = await run(src);
      expect(out.compiled.success).toBe(true);
      for (const step of out.executionResults) expect(step.result).toMatchObject({ success: true });
    }
  }, 60_000);

  it("the head sweep really reaches both ends of the 180 degree field of view and ends facing forward", async () => {
    const angles: number[] = [];
    const onCmd = (c: any) => { if (c.type === "EYE_SET") angles.push(c.params.angle); };
    simulatedRobot.on("command", onCmd);
    await run(byFirstLine("EYE_SET 0"));
    simulatedRobot.off("command", onCmd);
    expect(angles).toEqual([0, 180]);
    expect(st().headAngle).toBe(90);
  }, 30_000);

  it("the look-around glances at random angles within 20-160 and ends facing forward", async () => {
    const angles: number[] = [];
    const onCmd = (c: any) => { if (c.type === "EYE_SET") angles.push(c.params.angle); };
    simulatedRobot.on("command", onCmd);
    await run(byFirstLine("REPEAT 5 TIMES\n  RANDOM"));
    simulatedRobot.off("command", onCmd);
    expect(angles).toHaveLength(5);
    for (const a of angles) { expect(a).toBeGreaterThanOrEqual(20); expect(a).toBeLessThanOrEqual(160); }
    expect(st().headAngle).toBe(90);
  }, 30_000);

  it("the 'walk a square' example closes the square: back near where it started, facing the same way", async () => {
    // fresh pose
    const p = st().pose; p.x = 0; p.z = 0; p.headingDeg = 0;
    await run(byFirstLine("REPEAT 4 TIMES\n  WALK_FORWARD"));
    await new Promise((r) => setTimeout(r, 100));
    simulatedRobot.step(Date.now());
    const { x, z, headingDeg } = st().pose;
    const offStart = Math.hypot(x, z);
    expect(offStart).toBeLessThan(0.05);                                 // side length is ~9 cm; ends within 5 cm of the start
    const off = Math.min(headingDeg, 360 - headingDeg);
    expect(off).toBeLessThan(10);                                        // four ~90 degree turns = a full circle
  }, 60_000);

  it("driving the legs by hand: opposite directions spin the body in place; stopping ends it", async () => {
    const p = st().pose; p.x = 0; p.z = 0; p.headingDeg = 0;
    await run(byFirstLine("LEFT_LEG_ROTATE 50"));
    simulatedRobot.step(Date.now());
    expect(Math.hypot(st().pose.x, st().pose.z)).toBeLessThan(0.01);     // it spun on the spot
    expect(st().pose.headingDeg).toBeGreaterThan(30);                    // ...and actually turned (right: left leg forward)
    expect(st().pose.headingDeg).toBeLessThan(330);
    expect(st().leftLeg.direction).toBe("STOP");
    expect(st().rightLeg.direction).toBe("STOP");
  }, 30_000);

  it("looking sideways while walking: the walk continues through a quick glance, then stops", async () => {
    const p = st().pose; p.x = 0; p.z = 0; p.headingDeg = 0;
    const headSeen: number[] = [];
    const onState = (s: any) => headSeen.push(Math.round(s.headPhysicalAngle));
    simulatedRobot.on("state", onState);
    await run(byFirstLine("WALK_FORWARD\nWAIT 300"));
    simulatedRobot.off("state", onState);
    expect(Math.max(...headSeen)).toBeGreaterThan(110);                  // the head really turned toward 135 during the walk
    expect(st().pose.z).toBeGreaterThan(0.01);                           // and it moved forward
    expect(st().headAngle).toBe(90);
    expect(st().leftLeg.direction).toBe("STOP");
  }, 30_000);
});
