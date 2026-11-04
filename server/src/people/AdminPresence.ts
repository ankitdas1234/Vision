/**
 * "IS AN ADMIN ACTUALLY HERE RIGHT NOW?"
 * ---------------------------------------
 * EMERGENCY_STOP is admin-only (see ADMIN_ONLY_COMMANDS in
 * packages/commands.ts) — but gating it on a dashboard LOGIN role would
 * mean an open, unattended admin session (or a stolen session cookie)
 * could authorize it from anywhere, with nobody actually present. This
 * tracks the two forms of LIVE, in-the-moment proof the codebase already
 * has a real answer for:
 *
 *   VOICE — a speech segment whose voiceprint matched an enrolled ADMIN
 *   and was spoken directly to Vision (`ConversationArbiter`'s
 *   `chosenIsAuthorizedAdmin` — the exact same bar ADMIN_VETO already
 *   requires).
 *
 *   FACE — a face the multi-frame recognizer has fully CONFIRMED (not
 *   just a single-frame guess — see `personRecognition.ts`) belongs to a
 *   person whose category is ADMIN.
 *
 * Either one, recently enough, counts as "an admin is here." Like
 * mental/Annoyance.ts, this is a short-lived, per-robot, in-memory flag
 * on purpose: presence is a fact about right now, not a grant that should
 * outlive the moment or survive a restart.
 */

/** How long a confirmation counts as "still true." Long enough to walk
 * from being seen/heard to actually reaching for a stop control; short
 * enough that a confirmation from ten minutes ago can't authorize
 * something happening now, with nobody still there. */
export const ADMIN_PRESENCE_WINDOW_MS = 30 * 1000;

type Signal = "VOICE" | "FACE";

interface PresenceEntry {
  lastVoiceAtMs: number;
  lastFaceAtMs: number;
}

const byRobot = new Map<string, PresenceEntry>();

function getEntry(robotId: string): PresenceEntry {
  let entry = byRobot.get(robotId);
  if (!entry) {
    // -Infinity, not 0 — a timestamp of 0 is "now - 0 <= window" for any
    // small `now` (exactly what the unit tests use), which would make a
    // signal that was NEVER set read as freshly confirmed. -Infinity can
    // never fall inside a finite window.
    entry = { lastVoiceAtMs: -Infinity, lastFaceAtMs: -Infinity };
    byRobot.set(robotId, entry);
  }
  return entry;
}

/** Call whenever `ConversationArbiter` reports `chosenIsAuthorizedAdmin`
 * for this robot — regardless of what the admin actually said. Any
 * confirmed-admin voice interaction refreshes presence, not only an
 * explicit "emergency stop" utterance; someone the system just voice-
 * verified as an admin is, factually, an admin who is here. */
export function noteAdminVoiceConfirmed(robotId: string, now = Date.now()) {
  getEntry(robotId).lastVoiceAtMs = now;
}

/** Call from the brain cycle whenever face recognition CONFIRMS (not
 * PROVISIONAL/UNKNOWN — see personRecognition.ts's IdentityStatus) a
 * person whose category is ADMIN. */
export function noteAdminFaceConfirmed(robotId: string, now = Date.now()) {
  getEntry(robotId).lastFaceAtMs = now;
}

/** True if either signal is still fresh. Used where there is no specific
 * "this utterance" to check — a dashboard button press has no speaker of
 * its own, only ambient presence, so either recently-confirmed channel is
 * the best available proxy for "an admin is here." */
export function isAdminPresent(robotId: string, now = Date.now()): boolean {
  const entry = byRobot.get(robotId);
  if (!entry) return false;
  return now - entry.lastVoiceAtMs <= ADMIN_PRESENCE_WINDOW_MS || now - entry.lastFaceAtMs <= ADMIN_PRESENCE_WINDOW_MS;
}

/** True if the FACE signal specifically is fresh — deliberately excludes
 * voice. See routes/conversation.routes.ts: when someone SPEAKS an
 * emergency-stop request, their own voice match (`chosenIsAuthorizedAdmin`,
 * checked directly against that exact utterance) is what proves it's them
 * — a stale voice confirmation from a different turn, possibly a
 * different speaker entirely, must not be borrowed to authorize this one.
 * A recent confirmed-admin FACE has no such "which turn" ambiguity (it's
 * the best available proxy for "the admin is physically here right now"
 * with a single camera and no per-utterance face linkage), so it's kept
 * as the second, independent path — "by voice OR face" — without letting
 * an old voice confirmation silently cover for a different person's request. */
export function isAdminFacePresent(robotId: string, now = Date.now()): boolean {
  const entry = byRobot.get(robotId);
  if (!entry) return false;
  return now - entry.lastFaceAtMs <= ADMIN_PRESENCE_WINDOW_MS;
}

/** Which signal(s) are currently live — surfaced in API responses so a
 * dashboard can show "verified by face" vs "verified by voice" rather
 * than an opaque true/false. */
export function activeAdminSignals(robotId: string, now = Date.now()): Signal[] {
  const entry = byRobot.get(robotId);
  if (!entry) return [];
  const signals: Signal[] = [];
  if (now - entry.lastVoiceAtMs <= ADMIN_PRESENCE_WINDOW_MS) signals.push("VOICE");
  if (now - entry.lastFaceAtMs <= ADMIN_PRESENCE_WINDOW_MS) signals.push("FACE");
  return signals;
}

/** Test/reset hook. */
export function resetAdminPresence(robotId?: string) {
  if (robotId) byRobot.delete(robotId);
  else byRobot.clear();
}
