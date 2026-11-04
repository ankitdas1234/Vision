/**
 * INTRODUCTIONS
 * -------------
 * When Vision meets someone brand new and they're actually standing in
 * front of it (see BrainOrchestrator's "approaching" gate), it asks their
 * name out loud (AUDIO_SPEAK) and records a pending introduction here. The
 * next transcript that comes back through POST /api/audio/process for that
 * robot is then treated as their answer rather than run through the normal
 * small-talk/command intent classifier — see routes/audio.routes.ts.
 *
 * Deliberately simple (one pending introduction per robot, with a timeout)
 * rather than a full dialogue-state machine — this hardware has one robot
 * talking to, at most, whoever is currently in front of it.
 */

export interface PendingIntroduction {
  personId: string;
  askedAtMs: number;
}

const PENDING_TIMEOUT_MS = 60_000; // give up waiting for a name after a minute

const pendingByRobot = new Map<string, PendingIntroduction>();

export function askForName(robotId: string, personId: string) {
  pendingByRobot.set(robotId, { personId, askedAtMs: Date.now() });
}

export function getPendingIntroduction(robotId: string): PendingIntroduction | null {
  const pending = pendingByRobot.get(robotId);
  if (!pending) return null;
  if (Date.now() - pending.askedAtMs > PENDING_TIMEOUT_MS) {
    pendingByRobot.delete(robotId);
    return null;
  }
  return pending;
}

export function clearPendingIntroduction(robotId: string) {
  pendingByRobot.delete(robotId);
}

/** Strips common framing phrases ("my name is", "i'm", "call me") so "my
 * name is Sam" and "Sam" both resolve to the same stored name. Falls back
 * to the trimmed original if no framing phrase is found. */
export function extractNameFromTranscript(transcript: string): string {
  const text = transcript.trim();
  const patterns = [/^(?:my name is|i am|i'm|it's|its|call me)\s+/i];
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      const stripped = text.replace(pattern, "").trim();
      if (stripped) return capitalize(stripped);
    }
  }
  return capitalize(text);
}

function capitalize(text: string): string {
  return text
    .split(/\s+/)
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}
