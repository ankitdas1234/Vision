import { describe, it, expect } from "vitest";
import { applyPolicies } from "../../../src/decisions/policies";
import { DEFAULT_MENTAL_STATE } from "../../../src/mental/state";

describe("decision maker safety validation", () => {
  it("does not select TRACK_PERSON/movement when mental state signals SAFETY_STOP", () => {
    const decision = applyPolicies({
      observationId: "obs1",
      memorySource: "STATIC",
      memoryConfidence: 1,
      mentalState: { ...DEFAULT_MENTAL_STATE, intent: "IGNORE", internalState: "SAFETY_STOP" },
      personDetected: false,
    });
    expect(decision.decision).toBe("IGNORE");
  });

  it("still tracks a detected person independent of curiosity intent (safety-neutral case)", () => {
    const decision = applyPolicies({
      observationId: "obs2",
      memorySource: "STATIC",
      memoryConfidence: 1,
      mentalState: { ...DEFAULT_MENTAL_STATE, intent: "OBSERVE" },
      personDetected: true,
    });
    expect(decision.decision).toBe("TRACK_PERSON");
  });
});
