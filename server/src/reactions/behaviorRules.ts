import type { Decision } from "../decisions/decisionTypes";
import type { Reaction } from "../packages/types";

export function reactionFor(decision: Decision, behaviorTone: string): Reaction {
  switch (decision.decision) {
    case "TRACK_PERSON":
      return { state: "TRACKING", gestures: [{ type: "EYE_TRACK", target: "PERSON" }], reason: decision.reason, confidence: decision.confidence };
    case "INVESTIGATE":
      return { state: "CURIOUS", gestures: [{ type: "EYE_TRACK", target: "OBJECT" }], reason: decision.reason, confidence: decision.confidence, speech: undefined };
    case "GREET":
      return { state: behaviorTone.toUpperCase(), gestures: [{ type: "EYE_CENTER" }], reason: decision.reason, confidence: decision.confidence };
    case "LEARN":
      return { state: "LEARNING", gestures: [], reason: decision.reason, confidence: decision.confidence };
    case "OBSERVE_ONLY":
      return { state: "OBSERVING", gestures: [], reason: decision.reason, confidence: decision.confidence };
    default:
      return { state: "IDLE", gestures: [], reason: decision.reason, confidence: decision.confidence };
  }
}
