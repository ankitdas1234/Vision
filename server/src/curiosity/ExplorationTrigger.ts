export const IDLE_EXPLORATION_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes, per spec

export interface ExplorationContext {
  lastHumanInteractionAt: number; // epoch ms
  activeConversation: boolean;
  emergencyActive: boolean;
  hardwareHealthy: boolean;
  environmentSafe: boolean;
  conflictingCriticalTask: boolean;
}

/**
 * Pure decision function: should Vision enter CURIOUS/EXPLORATION mode right now?
 * Exploration NEVER overrides safety — every safety-related flag here is a
 * hard veto, not a weighted factor.
 */
export function shouldEnterExploration(ctx: ExplorationContext, now = Date.now()): boolean {
  if (ctx.emergencyActive || !ctx.hardwareHealthy || !ctx.environmentSafe) return false;
  if (ctx.activeConversation || ctx.conflictingCriticalTask) return false;
  return now - ctx.lastHumanInteractionAt > IDLE_EXPLORATION_THRESHOLD_MS;
}
