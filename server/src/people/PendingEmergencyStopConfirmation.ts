/**
 * "LET ME CHECK" — instead of just refusing
 * ------------------------------------------
 * Before this, an unverified "emergency stop" request got a flat refusal
 * and nothing else: `routes/conversation.routes.ts` checked
 * `chosenIsAuthorizedAdmin`/`isAdminFacePresent` at that one instant and,
 * if neither held, told the person no and moved on.
 *
 * That's a dead end for a genuine admin whose voice didn't happen to be
 * caught cleanly, or who wasn't in camera view yet when they spoke. This
 * gives them a path forward: Vision holds the request open for a short
 * window, turns to actually look, and if a CONFIRMED admin face shows up
 * in that window (see `people/AdminPresence.ts` for what CONFIRMED means)
 * — even without them repeating the phrase — the stop goes through then.
 *
 * This does NOT lower the bar for who can authorize a stop. It's the same
 * two signals (voice or face) as before; the only change is that a face
 * confirmation arriving a few seconds AFTER the request, instead of
 * before it, now counts. See `brain/BrainOrchestrator.ts` for the other
 * half — it's what actually watches for the confirmation and fires the
 * dispatch once the window is open.
 */

/** How long Vision keeps looking before giving up. Short on purpose — an
 * emergency stop that's still "pending" a minute later isn't emergency
 * anything anymore; the person should just try again if it's still needed. */
export const CONFIRMATION_WINDOW_MS = 20 * 1000;

/** No directional microphone exists (one mono mic — see audio/Diarization.ts),
 * so Vision can't turn TOWARD the voice, only search both sides. The first
 * turn fires immediately when the window opens; if nobody's confirmed by
 * this point, a second turn covers the opposite side, so a mis-guess on
 * which way to turn first doesn't cost the whole window. */
export const SECOND_TURN_DELAY_MS = 8 * 1000;

/** How long each body turn runs. Matches the firmware side of this fix —
 * see firmware/esp32-cam/src/gait/GaitController.cpp: below this change,
 * firmware's turnLeft()/turnRight() ran indefinitely until a separate
 * WALK_STOP arrived, which the poll-based server-firmware link could
 * delay or drop. A bounded duration now auto-stops on-device. */
export const TURN_DURATION_MS = 900;

interface PendingConfirmation {
  requestedAtMs: number;
  /** Speaker who asked, if known — surfaced so a later log/UI can show
   * who triggered the check, even though it isn't what authorizes it. */
  requestedByPersonId: string | null;
  /** So BrainOrchestrator speaks the timeout line exactly once, not every
   * cycle for the rest of the window after it's already expired-and-handled. */
  timedOutMessageSent: boolean;
  /** So the opposite-side turn fires exactly once, at SECOND_TURN_DELAY_MS,
   * not on every brain cycle after that point for the rest of the window. */
  secondTurnDone: boolean;
}

const pendingByRobot = new Map<string, PendingConfirmation>();

export function openConfirmationWindow(robotId: string, requestedByPersonId: string | null, now = Date.now()) {
  pendingByRobot.set(robotId, { requestedAtMs: now, requestedByPersonId, timedOutMessageSent: false, secondTurnDone: false });
}

export function getPendingConfirmation(robotId: string): PendingConfirmation | null {
  return pendingByRobot.get(robotId) ?? null;
}

export function isConfirmationPending(robotId: string, now = Date.now()): boolean {
  const entry = pendingByRobot.get(robotId);
  return !!entry && now - entry.requestedAtMs <= CONFIRMATION_WINDOW_MS;
}

export function hasConfirmationExpired(robotId: string, now = Date.now()): boolean {
  const entry = pendingByRobot.get(robotId);
  return !!entry && now - entry.requestedAtMs > CONFIRMATION_WINDOW_MS;
}

export function markTimedOutMessageSent(robotId: string) {
  const entry = pendingByRobot.get(robotId);
  if (entry) entry.timedOutMessageSent = true;
}

/** True exactly once per window, SECOND_TURN_DELAY_MS after it opened,
 * while it's still pending and hasn't already turned the other way. */
export function shouldAttemptSecondTurn(robotId: string, now = Date.now()): boolean {
  const entry = pendingByRobot.get(robotId);
  if (!entry || entry.secondTurnDone) return false;
  if (now - entry.requestedAtMs > CONFIRMATION_WINDOW_MS) return false;
  return now - entry.requestedAtMs >= SECOND_TURN_DELAY_MS;
}

export function markSecondTurnDone(robotId: string) {
  const entry = pendingByRobot.get(robotId);
  if (entry) entry.secondTurnDone = true;
}

export function clearPendingConfirmation(robotId: string) {
  pendingByRobot.delete(robotId);
}

/** Test/reset hook. */
export function resetPendingConfirmations(robotId?: string) {
  if (robotId) pendingByRobot.delete(robotId);
  else pendingByRobot.clear();
}
