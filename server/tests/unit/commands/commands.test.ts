import { describe, it, expect } from "vitest";
import { validateCommand, CommandValidationError } from "../../../src/commands/CommandValidator";

describe("command validation", () => {
  it("TEST 15: admin-only command rejected for a non-admin user", () => {
    expect(() => validateCommand("ULTRASONIC_DISABLE", {}, { source: "DASHBOARD", isAdmin: false })).toThrow(CommandValidationError);
  });

  it("admin-only command passes validation for an admin", () => {
    expect(() => validateCommand("ULTRASONIC_DISABLE", {}, { source: "DASHBOARD", isAdmin: true })).not.toThrow();
  });

  // EMERGENCY_STOP is admin-gated by explicit design choice — see the
  // comment on ADMIN_ONLY_COMMANDS in packages/commands.ts for the
  // trade-off and why. "isAdmin" here is decided by live voice/face
  // presence (people/AdminPresence.ts), not a login role — this test is
  // only about CommandValidator's own enforcement of the flag, which
  // doesn't care where the flag came from.
  it("EMERGENCY_STOP is admin-gated — rejected without a live admin confirmation", () => {
    expect(() => validateCommand("EMERGENCY_STOP", {}, { source: "DASHBOARD", isAdmin: false })).toThrow(CommandValidationError);
  });

  it("EMERGENCY_STOP passes validation once an admin is confirmed present", () => {
    expect(() => validateCommand("EMERGENCY_STOP", {}, { source: "DASHBOARD", isAdmin: true })).not.toThrow();
  });

  it("EMERGENCY_STOP cannot be issued directly by AI or PI_SCRIPT even with isAdmin set", () => {
    expect(() => validateCommand("EMERGENCY_STOP", {}, { source: "AI", isAdmin: true })).toThrow(CommandValidationError);
    expect(() => validateCommand("EMERGENCY_STOP", {}, { source: "PI_SCRIPT", isAdmin: true })).toThrow(CommandValidationError);
  });

  it("EMERGENCY_CLEAR (resuming after a stop) IS admin-gated — rejected for a non-admin", () => {
    expect(() => validateCommand("EMERGENCY_CLEAR", { reason: "checked, all clear" }, { source: "DASHBOARD", isAdmin: false })).toThrow(CommandValidationError);
  });

  it("EMERGENCY_CLEAR passes validation for an admin with a reason", () => {
    expect(() => validateCommand("EMERGENCY_CLEAR", { reason: "checked, all clear" }, { source: "DASHBOARD", isAdmin: true })).not.toThrow();
  });
});

import { commandExecutor } from "../../../src/commands/CommandExecutor";

describe("command executor coverage", () => {
  it("EYE_TRACK_PERSON has a real handler (regression: previously unregistered)", async () => {
    const result = await commandExecutor.execute({
      commandId: "c1", type: "EYE_TRACK_PERSON", params: {}, ctx: { source: "SYSTEM", robotId: "vision-001" },
    });
    expect(result).toHaveProperty("tracking", true);
  });

  it("LEFT_LEG_ROTATE and RIGHT_LEG_ROTATE have real handlers", async () => {
    const left = await commandExecutor.execute({ commandId: "c2", type: "LEFT_LEG_ROTATE", params: { speed: 50 }, ctx: { source: "DASHBOARD", robotId: "vision-001" } });
    const right = await commandExecutor.execute({ commandId: "c3", type: "RIGHT_LEG_ROTATE", params: { speed: -50 }, ctx: { source: "DASHBOARD", robotId: "vision-001" } });
    expect(left).toHaveProperty("pwm");
    expect(right).toHaveProperty("pwm");
  });
});
