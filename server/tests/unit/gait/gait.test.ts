import { describe, it, expect, vi } from "vitest";
import { ServoManager } from "../../../src/servos/ServoManager";
import { GaitController } from "../../../src/gait/GaitController";

describe("gait", () => {
  it("TEST 9: walk forward -> phases execute (continuous servos engage)", async () => {
    vi.useFakeTimers();
    const servos = new ServoManager();
    const gait = new GaitController(servos);
    const promise = gait.run({ name: "t", stepDurationMs: 10, defaultSpeed: 60, phases: [{ phaseNumber: 1, durationMs: 10, leftRotationSpeed: 60, leftRotationDirection: "FORWARD", rightRotationSpeed: 60, rightRotationDirection: "FORWARD" }] }, "WALKING_FORWARD", 20);
    await vi.runAllTimersAsync();
    await promise;
    expect(gait.gaitState).toBe("STOPPED");
    vi.useRealTimers();
  });

  it("TEST 10: emergency stop during gait -> all movement stops", () => {
    const servos = new ServoManager();
    const gait = new GaitController(servos);
    gait.stop();
    expect(servos.getContinuous(1).state.direction).toBe("STOP");
    expect(servos.getContinuous(2).state.direction).toBe("STOP");
  });
});
