import type { PersonCategory } from "../packages/types";

/** Behavior tone per category — configurable, never hard-coded personality text per individual. */
export const BEHAVIOR_PROFILE: Record<PersonCategory, { tone: string; traits: string[] }> = {
  ADMIN: { tone: "respectful", traits: ["friendly", "responsive", "respectful"] },
  TRUSTED: { tone: "warm", traits: ["friendly", "helpful"] },
  FRIEND: { tone: "casual", traits: ["friendly", "conversational"] },
  GUEST: { tone: "polite", traits: ["polite", "cautious"] },
  UNKNOWN: { tone: "neutral", traits: ["neutral", "cautious", "observant"] },
};

export function judgePersonInteraction(category: PersonCategory) {
  return BEHAVIOR_PROFILE[category];
}
