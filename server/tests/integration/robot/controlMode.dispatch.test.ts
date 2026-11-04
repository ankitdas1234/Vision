import { describe, it, expect, vi, beforeEach } from "vitest";

let manualEnabled = false;

vi.mock("../../../src/control/ControlMode", () => ({
  controlMode: { isManualModeEnabled: () => Promise.resolve(manualEnabled) },
  ControlModeError: class ControlModeError extends Error { code = "AUTONOMOUS_MODE_ACTIVE"; },
}));

describe("CommandRegistry x Control Mode integration", () => {
  beforeEach(() => { manualEnabled = false; vi.resetModules(); });

  it("rejects a DASHBOARD-sourced WALK_FORWARD while AUTONOMOUS (default)", async () => {
    const { commandRegistry } = await import("../../../src/commands/CommandRegistry");
    const result = await commandRegistry.dispatch({ type: "WALK_FORWARD", params: {}, source: "DASHBOARD", robotId: "vision-001", isAdmin: false });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("AUTONOMOUS_MODE_ACTIVE");
  });

  it("allows a DASHBOARD-sourced WALK_FORWARD once MANUAL mode is enabled", async () => {
    manualEnabled = true;
    const { commandRegistry } = await import("../../../src/commands/CommandRegistry");
    const result = await commandRegistry.dispatch({ type: "WALK_FORWARD", params: {}, source: "DASHBOARD", robotId: "vision-001", isAdmin: false });
    expect(result.success).toBe(true);
  });

  it("EMERGENCY_STOP always succeeds regardless of mode", async () => {
    const { commandRegistry } = await import("../../../src/commands/CommandRegistry");
    const result = await commandRegistry.dispatch({ type: "EMERGENCY_STOP", params: {}, source: "DASHBOARD", robotId: "vision-001", isAdmin: true });
    expect(result.success).toBe(true);
  });

  it("SYSTEM-sourced (brain) commands are never gated by manual mode", async () => {
    const { commandRegistry } = await import("../../../src/commands/CommandRegistry");
    const result = await commandRegistry.dispatch({ type: "EYE_TRACK_PERSON", params: {}, source: "SYSTEM", robotId: "vision-001", isAdmin: true });
    expect(result.success).toBe(true);
  });
});
