import { describe, it, expect } from "vitest";
import { buildReturnPath } from "../../../src/people/DeadReckoning";

describe("buildReturnPath", () => {
  it("returns an empty path for an empty patrol log", () => {
    expect(buildReturnPath([])).toEqual([]);
  });

  it("inverts a single walk-forward step into a walk-backward of the same duration", () => {
    expect(buildReturnPath([{ type: "WALK_FORWARD", durationMs: 1000 }])).toEqual([{ type: "WALK_BACKWARD", durationMs: 1000 }]);
  });

  it("inverts a single turn-left step into a turn-right of the same duration", () => {
    expect(buildReturnPath([{ type: "TURN_LEFT", durationMs: 500 }])).toEqual([{ type: "TURN_RIGHT", durationMs: 500 }]);
  });

  it("reverses the order of a multi-step patrol, not just inverts in place", () => {
    const patrol = [
      { type: "WALK_FORWARD" as const, durationMs: 1000 },
      { type: "TURN_LEFT" as const, durationMs: 500 },
      { type: "WALK_FORWARD" as const, durationMs: 2000 },
    ];
    const result = buildReturnPath(patrol);
    expect(result).toEqual([
      { type: "WALK_BACKWARD", durationMs: 2000 },
      { type: "TURN_RIGHT", durationMs: 500 },
      { type: "WALK_BACKWARD", durationMs: 1000 },
    ]);
  });

  it("round-trips: applying the return path after the patrol conceptually cancels every step", () => {
    const patrol = [
      { type: "TURN_LEFT" as const, durationMs: 300 },
      { type: "WALK_FORWARD" as const, durationMs: 1200 },
      { type: "TURN_LEFT" as const, durationMs: 800 },
    ];
    const returnPath = buildReturnPath(patrol);
    for (let i = 0; i < patrol.length; i++) {
      const original = patrol[patrol.length - 1 - i];
      const undone = returnPath[i];
      expect(undone.durationMs).toBe(original.durationMs);
      expect(undone.type).toBe(original.type === "WALK_FORWARD" ? "WALK_BACKWARD" : "TURN_RIGHT");
    }
  });

  it("does not mutate the input log", () => {
    const patrol = [{ type: "WALK_FORWARD" as const, durationMs: 1000 }];
    const copy = JSON.parse(JSON.stringify(patrol));
    buildReturnPath(patrol);
    expect(patrol).toEqual(copy);
  });
});
