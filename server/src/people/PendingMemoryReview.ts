/**
 * PENDING MEMORY REVIEW
 * ----------------------
 * Same shape as people/Introductions.ts's pending-name-question: Vision
 * asks something out loud (here: "is this fact I learned about Ram
 * right?"), and the very next transcript heard back for that robot is
 * treated as the answer to THAT question rather than run through the
 * normal command/small-talk intent pipeline — see
 * routes/conversation.routes.ts.
 *
 * One pending question per robot, with a timeout, for the same reason
 * Introductions.ts is: this hardware has one robot talking to, at most,
 * whoever is currently in front of it.
 */

export interface PendingMemoryReview {
  memoryId: string;
  personId: string;
  /** The fact's current wording, kept here (not re-fetched from the DB
   * when the answer comes in) so a correction can be logged/compared
   * against exactly what was read aloud, even if something else edited
   * the row in the few seconds in between. */
  content: string;
  askedAtMs: number;
}

const PENDING_TIMEOUT_MS = 45_000; // shorter than Introductions.ts's — a yes/no is quicker to answer than a name

const pendingByRobot = new Map<string, PendingMemoryReview>();

export function askAboutMemory(robotId: string, memory: { id: string; personId: string; content: string }) {
  pendingByRobot.set(robotId, { memoryId: memory.id, personId: memory.personId, content: memory.content, askedAtMs: Date.now() });
}

export function getPendingMemoryReview(robotId: string): PendingMemoryReview | null {
  const pending = pendingByRobot.get(robotId);
  if (!pending) return null;
  if (Date.now() - pending.askedAtMs > PENDING_TIMEOUT_MS) {
    pendingByRobot.delete(robotId);
    return null;
  }
  return pending;
}

export function clearPendingMemoryReview(robotId: string) {
  pendingByRobot.delete(robotId);
}

/** Whether THIS robot currently has any open spoken question at all
 * (name-asking or memory-review) — used to avoid Vision stacking a
 * second question on top of one it's still waiting on an answer for.
 * Takes the other pending-check as a parameter rather than importing
 * Introductions.ts here, to keep this module's only job being its own
 * state. */
export function hasPendingMemoryReview(robotId: string): boolean {
  return getPendingMemoryReview(robotId) !== null;
}
