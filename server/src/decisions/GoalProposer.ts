import { openRouterClient } from "../ai/OpenRouterClient";
import { getCapabilities } from "../robot/capabilities";
import { logger } from "../logging/Logger";

/**
 * GOAL PROPOSER — the "slow deliberative loop"
 * -----------------------------------------------
 * Called only while ExplorationController has already decided Vision is
 * genuinely alone and safe to explore (see curiosity/ExplorationController.ts
 * — this file never checks that itself, it's not this file's job). Picks
 * ONE goal from a small, fixed, real vocabulary — never free text — so an
 * LLM response can't propose an action Vision doesn't actually have.
 * A malformed/unparseable/out-of-vocabulary response is rejected and
 * falls back to a safe default rather than trusting it.
 */

export const EXPLORATION_GOALS = ["SCAN_AREA", "INVESTIGATE_NEAREST_UNKNOWN_OBJECT", "WANDER", "RETURN_AND_REST"] as const;
export type ExplorationGoal = (typeof EXPLORATION_GOALS)[number];

export interface ProposedGoal {
  goal: ExplorationGoal;
  reason: string;
  /** True if a real model call produced this; false if it's the safe
   * fallback (AI not configured, or the response didn't parse/validate). */
  fromModel: boolean;
}

const FALLBACK_GOAL: ExplorationGoal = "WANDER";

export interface GoalProposalContext {
  /** Short free-text summary of recent memory/observations — NOT sent back
   * as-is, just context for the model's choice. See MemoryManager for
   * where this would normally come from. */
  recentMemorySummary: string;
  /** How many consecutive goals have been proposed this exploration
   * session — included so the model can vary its choice rather than
   * picking the same goal every time out of habit. */
  goalsProposedThisSession: number;
  hasUnknownObjectsNearby: boolean;
}

function buildPrompt(ctx: GoalProposalContext): string {
  const capabilities = getCapabilities();
  return [
    "You are the exploration goal-picker for a small home robot named Vision.",
    "Vision is currently alone (no person present) and safe to move.",
    `Its real physical capabilities: ${JSON.stringify(capabilities.features)}.`,
    `It has exactly ${capabilities.servoCount} servos: a head servo that turns 180° like a human head (the camera and ultrasonic sensor ride on it, so it can look around while walking) and one servo for each leg. It cannot climb, grip, or navigate to a named location — there is no map.`,
    `Recent context: ${ctx.recentMemorySummary || "nothing notable recently"}.`,
    `Unknown/unidentified objects currently visible: ${ctx.hasUnknownObjectsNearby ? "yes" : "no"}.`,
    `Goals proposed so far this session: ${ctx.goalsProposedThisSession}.`,
    "",
    `Pick exactly ONE goal from this list: ${EXPLORATION_GOALS.join(", ")}.`,
    "Respond with ONLY a JSON object, no other text, in this exact shape:",
    `{"goal": "<one of the list above>", "reason": "<one short sentence>"}`,
  ].join("\n");
}

function parseAndValidate(rawText: string): ProposedGoal | null {
  try {
    // Models sometimes wrap JSON in a code fence despite instructions —
    // strip that defensively rather than failing on an otherwise-valid response.
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { goal?: unknown; reason?: unknown };
    if (typeof parsed.goal !== "string" || !EXPLORATION_GOALS.includes(parsed.goal as ExplorationGoal)) {
      return null;
    }
    return {
      goal: parsed.goal as ExplorationGoal,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : "",
      fromModel: true,
    };
  } catch {
    return null;
  }
}

/**
 * Proposes the next exploration goal. Never throws — a failed/disabled/
 * malformed model call degrades to the safe fallback goal so exploration
 * always has *something* reasonable to do rather than stalling.
 */
export async function proposeGoal(ctx: GoalProposalContext): Promise<ProposedGoal> {
  try {
    const response = await openRouterClient.complete({ prompt: buildPrompt(ctx), purpose: "exploration_goal" });
    if (!response.text) {
      // AI not configured (aiConfig.enabled === false) — not an error,
      // just nothing to parse.
      return { goal: FALLBACK_GOAL, reason: "AI not configured; using default exploration behavior.", fromModel: false };
    }
    const parsed = parseAndValidate(response.text);
    if (!parsed) {
      logger.debug("Goal proposal response didn't parse/validate, using fallback", { rawText: response.text.slice(0, 200) });
      return { goal: FALLBACK_GOAL, reason: "Model response was invalid; using default exploration behavior.", fromModel: false };
    }
    return parsed;
  } catch (err) {
    logger.debug("Goal proposal call failed (non-fatal), using fallback", { error: (err as Error).message });
    return { goal: FALLBACK_GOAL, reason: "Goal proposal failed; using default exploration behavior.", fromModel: false };
  }
}
