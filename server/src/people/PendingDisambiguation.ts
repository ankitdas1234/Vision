/**
 * PENDING DISAMBIGUATION
 * ----------------------
 * "Find Sam" when there are two Sams: Vision can't take a photo as a
 * Vision Script argument (it's plaintext — see docs/vision-script.md), so
 * instead it asks out loud and waits for whoever's asking to hold a photo
 * up to its own camera. This tracks that wait, per robot:
 *
 *   1. people/PersonSearchRunner.ts starts one of these when a name
 *      matches multiple people, and speaks the question.
 *   2. Every subsequent camera capture, BrainOrchestrator.ts checks for a
 *      pending disambiguation and — bypassing the usual motion gate,
 *      since a photo HELD UP for the camera is typically held steady,
 *      which would otherwise look like "nothing changed" and get
 *      skipped — tries matching the frame against just the candidates
 *      being disambiguated between.
 *   3. A confident match calls resolveDisambiguation(), which
 *      PersonSearchRunner's wait loop picks up and continues the search
 *      with the now-resolved target.
 *
 * Same one-per-robot, poll-and-timeout shape as people/Introductions.ts —
 * this hardware talks to one person at a time.
 */

export interface PendingDisambiguation {
  taskId: string;
  targetName: string;
  candidateIds: string[];
  requestedByPersonId: string | null;
  askedAtMs: number;
  resolvedPersonId: string | null;
}

/** How long to keep watching for a shown photo before giving up — long
 * enough to find a physical photo or pull one up on a phone, short enough
 * that the search doesn't stall indefinitely on an ignored question. */
const DISAMBIGUATION_TIMEOUT_MS = 60_000;

const pendingByRobot = new Map<string, PendingDisambiguation>();

export function startDisambiguation(robotId: string, input: Omit<PendingDisambiguation, "askedAtMs" | "resolvedPersonId">) {
  pendingByRobot.set(robotId, { ...input, askedAtMs: Date.now(), resolvedPersonId: null });
}

/** Returns the pending disambiguation if one is active and not yet timed
 * out (never mutates timeout state — see isTimedOut for that check, kept
 * separate so a caller can distinguish "no longer waiting" from "timed
 * out" if it matters). */
export function getPendingDisambiguation(robotId: string): PendingDisambiguation | null {
  return pendingByRobot.get(robotId) ?? null;
}

export function isTimedOut(pending: PendingDisambiguation): boolean {
  return Date.now() - pending.askedAtMs > DISAMBIGUATION_TIMEOUT_MS;
}

export function resolveDisambiguation(robotId: string, personId: string) {
  const pending = pendingByRobot.get(robotId);
  if (pending) pending.resolvedPersonId = personId;
}

export function clearDisambiguation(robotId: string) {
  pendingByRobot.delete(robotId);
}
