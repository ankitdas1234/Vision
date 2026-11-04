import { describe, it, expect } from "vitest";
import { updateCuriosity, decideCuriosityAction } from "../../../src/mental/curiosity";

describe("mental intelligence curiosity", () => {
  it("increases curiosity for unknown object and decides INVESTIGATE at high curiosity", () => {
    const c = updateCuriosity({ isUnknownObject: true, isUnknownPerson: true, isUnexpectedEvent: false, hasConflictingMemory: false, isUnfamiliarEnvironment: false, recentlyInvestigated: false, isSafe: true, currentCuriosity: 60 });
    expect(c).toBeGreaterThan(60);
    expect(decideCuriosityAction(c, true)).toBe("INVESTIGATE");
  });
});
