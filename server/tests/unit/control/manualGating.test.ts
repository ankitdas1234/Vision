import { describe, it, expect } from "vitest";
import { MANUAL_GATED_COMMANDS } from "../../../src/packages/commands";

describe("MANUAL_GATED_COMMANDS classification", () => {
  it("gates active movement commands", () => {
    for (const cmd of ["WALK_FORWARD", "WALK_BACKWARD", "TURN_LEFT", "TURN_RIGHT", "EYE_SET", "LEFT_LEG_FORWARD", "RIGHT_LEG_FORWARD"]) {
      expect(MANUAL_GATED_COMMANDS.has(cmd as any)).toBe(true);
    }
  });

  it("never gates stop/center/safe commands — these must always work regardless of mode", () => {
    for (const cmd of ["EMERGENCY_STOP", "SERVOS_SAFE", "WALK_STOP", "LEFT_LEG_STOP", "RIGHT_LEG_STOP", "EYE_CENTER"]) {
      expect(MANUAL_GATED_COMMANDS.has(cmd as any)).toBe(false);
    }
  });
});
