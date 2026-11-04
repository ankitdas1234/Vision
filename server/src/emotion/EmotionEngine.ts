import type { EmotionState, PersonCategory } from "../packages/types";

export interface EmotionInput {
  personCategory?: PersonCategory;
  curiosity: number;
  uncertainty: number;
  isSafe: boolean;
  decision: string;
  /** Current irritation level (0-3) from mental/Annoyance.ts — a repeated
   * question or someone talking over a conversation. Ranked just below
   * safety: being annoyed never outranks being worried about a hazard. */
  annoyance?: number;
}

/**
 * Maps mental/decision context to a simulated emotional state that
 * influences speech style, eye behavior, and gestures. This is a
 * behavioral-state model, not a claim of genuine emotion.
 */
export function evaluateEmotion(input: EmotionInput): { emotion: EmotionState; intensity: number } {
  if (!input.isSafe) return { emotion: "WORRIED", intensity: 90 };
  if ((input.annoyance ?? 0) > 0) return { emotion: "ANNOYED", intensity: Math.min(100, 40 + (input.annoyance ?? 0) * 20) };
  if (input.decision === "INVESTIGATE" && input.curiosity >= 70) return { emotion: "CURIOUS", intensity: input.curiosity };
  if (input.uncertainty >= 70) return { emotion: "CONFUSED", intensity: input.uncertainty };
  if (input.personCategory === "ADMIN" || input.personCategory === "TRUSTED") return { emotion: "HAPPY", intensity: 70 };
  if (input.personCategory === "UNKNOWN") return { emotion: "CALM", intensity: 40 };
  return { emotion: "NEUTRAL", intensity: 30 };
}

/** How emotion should modulate delivery — consumed by the reaction/gesture layer. */
export function emotionToGestureHint(emotion: EmotionState): { speechPace: "slow" | "normal" | "fast"; eyeMovement: "subtle" | "normal" | "wide" } {
  switch (emotion) {
    case "EXCITED": case "SURPRISED": return { speechPace: "fast", eyeMovement: "wide" };
    case "WORRIED": case "SAD": return { speechPace: "slow", eyeMovement: "subtle" };
    case "CURIOUS": return { speechPace: "normal", eyeMovement: "wide" };
    case "CONFUSED": return { speechPace: "slow", eyeMovement: "normal" };
    // Curt and unwilling to keep looking at whoever caused it — the
    // delivery equivalent of a short answer.
    case "ANNOYED": return { speechPace: "fast", eyeMovement: "subtle" };
    default: return { speechPace: "normal", eyeMovement: "normal" };
  }
}

export const emotionEngine = { evaluate: evaluateEmotion, gestureHint: emotionToGestureHint };
