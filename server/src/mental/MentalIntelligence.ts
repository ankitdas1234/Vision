import type { MentalState, PersonCategory, CuriosityDecision, MentalIntelState } from "../packages/types";
import { updateCuriosity, decideCuriosityAction, type CuriosityInput } from "./curiosity";
import { judgePersonInteraction } from "./judgement";
import { DEFAULT_MENTAL_STATE, cloneState } from "./state";
import { shouldEnterExploration, type ExplorationContext } from "../curiosity/ExplorationTrigger";
import { evaluateEmotion } from "../emotion/EmotionEngine";

export interface MentalIntelligenceInput {
  personCategory?: PersonCategory;
  memoryConfidence: number;
  isSafe: boolean;
  curiosityInput: Omit<CuriosityInput, "currentCuriosity" | "isSafe">;
  currentTaskId?: string | null;
  /** Passed through to the emotion layer — see mental/Annoyance.ts. */
  annoyance?: number;
  exploration?: Omit<ExplorationContext, "emergencyActive" | "environmentSafe" | "lastHumanInteractionAt">;
}

export interface MentalIntelligenceOutput {
  state: MentalState;
  curiosityDecision: CuriosityDecision;
  behaviorTone: string;
  emotion: ReturnType<typeof evaluateEmotion>;
}

function internalStateFor(curiosityDecision: CuriosityDecision, explorationActive: boolean, isSafe: boolean): MentalIntelState {
  if (!isSafe) return "SAFETY_STOP";
  if (explorationActive) return "EXPLORING";
  switch (curiosityDecision) {
    case "INVESTIGATE": return "CURIOUS";
    case "ASK": return "INTERACTING";
    case "LEARN": return "LEARNING";
    case "OBSERVE": return "OBSERVING";
    default: return "IDLE";
  }
}

/**
 * Software decision-state subsystem. This produces behavior-selection
 * signals from perception + memory + context. It is explicitly NOT a claim
 * of consciousness — it is deterministic policy logic over numeric state.
 */
export class MentalIntelligence {
  private state: MentalState = cloneState(DEFAULT_MENTAL_STATE);
  private lastHumanInteractionAt = Date.now();

  /** Call whenever a person actually interacts (speech, recognized approach) — resets the 10-minute exploration timer. */
  noteHumanInteraction() { this.lastHumanInteractionAt = Date.now(); }

  evaluate(input: MentalIntelligenceInput): MentalIntelligenceOutput {
    const curiosity = updateCuriosity({ ...input.curiosityInput, currentCuriosity: this.state.curiosity, isSafe: input.isSafe });
    const curiosityDecision = decideCuriosityAction(curiosity, input.isSafe);
    const behavior = judgePersonInteraction(input.personCategory ?? "UNKNOWN");

    const explorationActive = input.isSafe && shouldEnterExploration({
      lastHumanInteractionAt: this.lastHumanInteractionAt,
      activeConversation: input.exploration?.activeConversation ?? false,
      emergencyActive: false, // checked separately via isSafe
      hardwareHealthy: input.exploration?.hardwareHealthy ?? true,
      environmentSafe: true, // checked separately via isSafe
      conflictingCriticalTask: input.exploration?.conflictingCriticalTask ?? false,
    });

    const internalState = internalStateFor(curiosityDecision, explorationActive, input.isSafe);
    const emotion = evaluateEmotion({
      personCategory: input.personCategory, curiosity, uncertainty: 100 - Math.round(input.memoryConfidence * 100),
      isSafe: input.isSafe, decision: curiosityDecision, annoyance: input.annoyance ?? 0,
    });

    this.state = {
      ...this.state,
      curiosity,
      confidence: Math.round(input.memoryConfidence * 100),
      alertness: input.isSafe ? this.state.alertness : Math.min(100, this.state.alertness + 20),
      mood: emotion.emotion,
      intent: curiosityDecision,
      internalState,
      explorationActive,
      currentTaskId: input.currentTaskId ?? this.state.currentTaskId,
    };

    return { state: cloneState(this.state), curiosityDecision, behaviorTone: behavior.tone, emotion };
  }

  getState() { return cloneState(this.state); }
  getIdleMs() { return Date.now() - this.lastHumanInteractionAt; }
}

export const mentalIntelligence = new MentalIntelligence();
