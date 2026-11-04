import { describe, it, expect, afterEach } from "vitest";
import { safetyManager, SafetyViolationError } from "../../../src/safety/SafetyManager";

describe("SafetyManager emergency stop / clear", () => {
  afterEach(() => {
    // Don't leak emergency state across tests.
    safetyManager.setEmergency(false);
  });

  it("blocks a movement command while emergency is active", () => {
    safetyManager.setEmergency(true);
    expect(() => safetyManager.check("WALK_FORWARD")).toThrow(SafetyViolationError);
  });

  it("still allows EMERGENCY_STOP and SERVOS_SAFE while emergency is active", () => {
    safetyManager.setEmergency(true);
    expect(() => safetyManager.check("EMERGENCY_STOP")).not.toThrow();
    expect(() => safetyManager.check("SERVOS_SAFE")).not.toThrow();
  });

  it("regression: EMERGENCY_CLEAR must be reachable while emergency is active — otherwise the stop is permanent", () => {
    safetyManager.setEmergency(true);
    // Before the fix, EMERGENCY_CLEAR had no exemption here and no handler
    // existed at all, so a triggered emergency stop could never be lifted
    // without restarting the server process.
    expect(() => safetyManager.check("EMERGENCY_CLEAR")).not.toThrow();
  });

  it("actually clears the flag and allows movement again afterwards", () => {
    safetyManager.setEmergency(true);
    expect(safetyManager.isEmergencyActive()).toBe(true);
    safetyManager.setEmergency(false);
    expect(safetyManager.isEmergencyActive()).toBe(false);
    expect(() => safetyManager.check("WALK_FORWARD")).not.toThrow();
  });
});
