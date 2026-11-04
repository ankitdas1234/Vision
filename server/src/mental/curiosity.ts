import type { CuriosityDecision } from "../packages/types";

export interface CuriosityInput {
  isUnknownObject: boolean;
  isUnknownPerson: boolean;
  isUnexpectedEvent: boolean;
  hasConflictingMemory: boolean;
  isUnfamiliarEnvironment: boolean;
  recentlyInvestigated: boolean;
  isSafe: boolean;
  currentCuriosity: number; // 0-100
}

export function updateCuriosity(input: CuriosityInput): number {
  let c = input.currentCuriosity;
  if (input.isUnknownObject) c += 15;
  if (input.isUnknownPerson) c += 20;
  if (input.isUnexpectedEvent) c += 10;
  if (input.hasConflictingMemory) c += 10;
  if (input.isUnfamiliarEnvironment) c += 5;
  if (input.recentlyInvestigated) c -= 20;
  if (!input.isSafe) c -= 30;
  return Math.min(100, Math.max(0, c));
}

export function decideCuriosityAction(curiosity: number, isSafe: boolean): CuriosityDecision {
  if (!isSafe) return "IGNORE";
  if (curiosity >= 80) return "INVESTIGATE";
  if (curiosity >= 60) return "ASK";
  if (curiosity >= 40) return "LEARN";
  if (curiosity >= 20) return "OBSERVE";
  return "IGNORE";
}
