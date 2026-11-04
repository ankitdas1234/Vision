import type { DecisionInput, Decision } from "./decisionTypes";

/** Deterministic, explainable policy rules — every decision must have a traceable reason. */
export function applyPolicies(input: DecisionInput): Decision {
  if (input.personDetected) {
    return { observationId: input.observationId, decision: "TRACK_PERSON", reason: "A person is present in frame.", confidence: input.memoryConfidence };
  }
  if (input.mentalState.intent === "INVESTIGATE") {
    return { observationId: input.observationId, decision: "INVESTIGATE", reason: "Curiosity threshold reached for an unfamiliar stimulus.", confidence: input.mentalState.curiosity / 100 };
  }
  if (input.mentalState.intent === "LEARN") {
    return { observationId: input.observationId, decision: "LEARN", reason: "New information identified worth remembering.", confidence: input.memoryConfidence };
  }
  if (input.mentalState.intent === "OBSERVE") {
    return { observationId: input.observationId, decision: "OBSERVE_ONLY", reason: "Insufficient signal to warrant a stronger reaction.", confidence: input.memoryConfidence };
  }
  return { observationId: input.observationId, decision: "IGNORE", reason: "No actionable stimulus detected.", confidence: 1 - input.mentalState.curiosity / 100 };
}
