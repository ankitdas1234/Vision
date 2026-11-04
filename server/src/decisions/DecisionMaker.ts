import { applyPolicies } from "./policies";
import type { DecisionInput, Decision } from "./decisionTypes";

export class DecisionMaker {
  decide(input: DecisionInput): Decision {
    return applyPolicies(input);
  }
}

export const decisionMaker = new DecisionMaker();
