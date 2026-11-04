/**
 * SHORT-LIVED IRRITATION
 * ----------------------
 * Being annoyed is a mood, not a verdict — it colors the next minute of
 * behavior and then wears off on its own. This holds that decaying flag
 * so the thing that CAUSES annoyance (a repeated question in
 * audio/RepetitionTracker.ts, someone talking over a conversation in
 * audio/ConversationArbiter.ts) doesn't have to reach into the emotion or
 * gesture layers itself.
 *
 * Read by mental/MentalIntelligence.ts via BrainOrchestrator, which turns
 * it into an ANNOYED emotion (emotion/EmotionEngine.ts) and, from there,
 * a curt tone and a turn-away gesture (reactions/GestureExecutor.ts).
 *
 * KEYED BY ROBOT CODE ("vision-001"): the conversation route sets it under
 * `ROBOT_HARDWARE.robotCode` and the brain loop reads it under the robotId
 * frames are posted with (`req.body?.robotId ?? "vision-001"`). Those are
 * the same string today; if they ever diverge, irritation set by a
 * conversation would silently never reach the mood/gesture layers — see
 * tests/integration/brain/annoyedMood.test.ts, which exists to catch that.
 *
 * In-memory and per-robot by design: an irritation that survived a server
 * restart, or followed someone home, would be a grudge — which is a
 * different and much less pleasant feature.
 */

/** How long irritation lasts with nothing further provoking it. */
export const ANNOYANCE_DECAY_MS = 60 * 1000;

interface AnnoyanceEntry {
  /** 1-3, matching RepetitionResult.level. */
  level: number;
  setAtMs: number;
}

const byRobot = new Map<string, AnnoyanceEntry>();

/** Something irritating just happened. Higher levels replace lower ones;
 * a lower level never calms an already-sharper mood, it just refreshes it. */
export function noteAnnoyance(robotId: string, level: number, now = Date.now()) {
  const current = getAnnoyance(robotId, now);
  byRobot.set(robotId, { level: Math.max(level, current), setAtMs: now });
}

/** Current irritation level, 0 once it's decayed. */
export function getAnnoyance(robotId: string, now = Date.now()): number {
  const entry = byRobot.get(robotId);
  if (!entry) return 0;
  if (now - entry.setAtMs > ANNOYANCE_DECAY_MS) {
    byRobot.delete(robotId);
    return 0;
  }
  return entry.level;
}

export function isAnnoyed(robotId: string, now = Date.now()): boolean {
  return getAnnoyance(robotId, now) > 0;
}

/** Explicit calm-down — used by tests, and available for an admin "alright,
 * settle down" path if one is ever added. */
export function clearAnnoyance(robotId?: string) {
  if (robotId) byRobot.delete(robotId);
  else byRobot.clear();
}
