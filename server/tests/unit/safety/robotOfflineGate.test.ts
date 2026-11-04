import { describe, it, expect, vi, beforeEach } from "vitest";

// SafetyManager reads env.MOCK_MODE at check()-time, and MOCK_MODE defaults
// to true for the whole test suite (see other safety tests) — so this file
// mocks env to false to actually exercise the offline gate added to close
// the "movement accepted while robot is disconnected" gap.
vi.mock("../../../src/config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/config/env")>();
  return { env: { ...actual.env, MOCK_MODE: false } };
});

describe("SafetyManager robot-offline gate (real, non-MOCK_MODE deployments)", () => {
  beforeEach(async () => {
    const { safetyManager } = await import("../../../src/safety/SafetyManager");
    safetyManager.setEmergency(false);
  });

  it("rejects a hardware command when the robot has never sent a heartbeat", async () => {
    const { safetyManager } = await import("../../../src/safety/SafetyManager");
    // Fresh RobotConnection instance: no markHeartbeat() call yet -> OFFLINE.
    expect(() => safetyManager.check("WALK_FORWARD")).toThrow(/offline/i);
  });

  it("allows a hardware command once a recent heartbeat has been recorded", async () => {
    const { safetyManager } = await import("../../../src/safety/SafetyManager");
    const { robotConnection } = await import("../../../src/robot/RobotConnection");
    robotConnection.markHeartbeat(false);
    expect(() => safetyManager.check("WALK_STOP")).not.toThrow();
  });

  it("never blocks EMERGENCY_STOP or SERVOS_SAFE, even while offline", async () => {
    const { safetyManager } = await import("../../../src/safety/SafetyManager");
    expect(() => safetyManager.check("EMERGENCY_STOP")).not.toThrow();
    expect(() => safetyManager.check("SERVOS_SAFE")).not.toThrow();
  });
});
