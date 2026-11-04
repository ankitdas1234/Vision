/**
 * PENDING BYSTANDER QUESTION
 * --------------------------
 * When a person search runs into someone who isn't the target (see
 * people/PersonSearchRunner.ts askBystanderAboutTarget), Vision asks them
 * "have you seen so-and-so?" out loud. This tracks that question so the
 * *next* conversation turn from this robot is interpreted as an answer to
 * it (see people/BystanderResponses.ts + routes/conversation.routes.ts),
 * rather than intercepting every conversation turn just because a search
 * happens to be running somewhere in the background.
 *
 * Same one-per-robot, poll-and-timeout shape as people/Introductions.ts.
 */
export interface PendingBystanderQuestion {
  taskId: string;
  targetName: string;
  askedAtMs: number;
}

const TIMEOUT_MS = 30_000;
const pendingByRobot = new Map<string, PendingBystanderQuestion>();

export function markBystanderAsked(robotId: string, taskId: string, targetName: string) {
  pendingByRobot.set(robotId, { taskId, targetName, askedAtMs: Date.now() });
}

export function getPendingBystanderQuestion(robotId: string): PendingBystanderQuestion | null {
  const pending = pendingByRobot.get(robotId);
  if (!pending) return null;
  if (Date.now() - pending.askedAtMs > TIMEOUT_MS) {
    pendingByRobot.delete(robotId);
    return null;
  }
  return pending;
}

export function clearPendingBystanderQuestion(robotId: string) {
  pendingByRobot.delete(robotId);
}
