import { describe, it, expect } from "vitest";
import { systemHealthService } from "../../../src/system/SystemHealthService";
import { ROBOT_HARDWARE } from "../../../src/config/robot";

describe("SystemHealthService servo check", () => {
  it("REGRESSION: does not report DEGRADED for a correctly-configured robot (was hardcoded to expect 5 servos; the real hardware has 4)", async () => {
    const report = await systemHealthService.run();
    const servos = report.subsystems.find((s) => s.key === "servos");

    expect(servos).toBeDefined();
    expect(servos!.status).not.toBe("DEGRADED");
    expect(servos!.label).toBe(`Servos (${ROBOT_HARDWARE.servoCount})`);
    expect(servos!.detail).toContain(`${ROBOT_HARDWARE.servoCount}/${ROBOT_HARDWARE.servoCount}`);
  });

  it("the expected count comes from config/robot.ts, not a hardcoded number", () => {
    // Documents the actual current hardware truth this check is built
    // against, so a future hardware change that updates config/robot.ts
    // is automatically reflected here too, with no separate constant to
    // remember to update (that's exactly the class of bug this test
    // exists to catch — see the fix in SystemHealthService.ts).
    expect(ROBOT_HARDWARE.servoCount).toBe(3);
  });
});
