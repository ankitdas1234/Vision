import { reactionFor } from "./behaviorRules";
import type { Decision } from "../decisions/decisionTypes";

export class ReactionEngine {
  select(decision: Decision, behaviorTone: string) {
    return reactionFor(decision, behaviorTone);
  }
}

export const reactionEngine = new ReactionEngine();
