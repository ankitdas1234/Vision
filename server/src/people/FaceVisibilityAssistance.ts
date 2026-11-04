/**
 * "CAN YOU COME CLOSER? I CAN'T SEE YOU."
 * -----------------------------------------
 * A person is detected (a body-shaped presence is in frame — see
 * perception/personDetection.ts) but no USABLE face came out of it — see
 * perception/qualityGate.ts's SkipReason and
 * perception/quality/faceQuality.ts's FaceQualityRejectReason. This
 * module is the pure decision logic for whether to attempt the physical
 * "back up a bit and check again, then ask" sequence;
 * people/FaceVisibilityRunner.ts is what actually executes it once this
 * says to.
 *
 * WHICH SKIP REASONS TRIGGER THIS, AND WHY ONLY THESE TWO: NO_FACE_DETECTED
 * (nothing found at all) and TOO_SMALL (a face was found but it's too
 * small a fraction of the frame to use) are both genuinely "too far away"
 * problems — creating more distance is exactly the wrong instinct, but
 * getting the PERSON to close the distance (by backing Vision away, or by
 * asking them to step closer) directly addresses the actual problem.
 * EXCESSIVE_YAW/EXCESSIVE_PITCH (they're looking away), LIKELY_OCCLUDED
 * (something's blocking the view), and TOO_BLURRY (motion blur) are NOT
 * distance problems — "come closer" doesn't fix someone facing sideways —
 * so those are deliberately left alone here to avoid giving irrelevant
 * advice.
 */

/** The full sequence (turn to check behind, turn back, maybe walk back,
 * then speak) takes several real seconds — this cooldown stops a new
 * attempt from starting every single ~1s brain cycle while the condition
 * persists. */
export const ATTEMPT_COOLDOWN_MS = 45 * 1000;

/** First attempt tries backing away (if it's safe to); second attempt
 * just asks directly without moving (maybe backing away didn't help, or
 * wasn't safe). After that, stop repeating the same unanswered request —
 * mirrors perception/LowLightAssistance.ts's MAX_ASK_ATTEMPTS reasoning:
 * if two tries haven't worked, a third likely won't either. */
export const MAX_ATTEMPTS = 2;

const DISTANCE_RELATED_SKIP_REASONS = new Set<string>(["NO_FACE_DETECTED", "TOO_SMALL"]);

interface RobotState {
  attempts: number;
  lastAttemptAtMs: number;
}

const stateByRobot = new Map<string, RobotState>();

export interface FaceVisibilityInput {
  robotId: string;
  personDetected: boolean;
  /** perceptionResult.recognition?.skipReason ?? null */
  skipReason: string | null;
  now?: number;
}

function getState(robotId: string): RobotState {
  let state = stateByRobot.get(robotId);
  if (!state) {
    state = { attempts: 0, lastAttemptAtMs: 0 };
    stateByRobot.set(robotId, state);
  }
  return state;
}

/** Pure gating logic only — no servo/speech I/O here, same separation
 * LowLightAssistance.ts uses between deciding and doing. */
export function shouldAttemptFaceVisibilityHelp(input: FaceVisibilityInput): boolean {
  const now = input.now ?? Date.now();
  if (!input.personDetected) return false;
  if (!input.skipReason || !DISTANCE_RELATED_SKIP_REASONS.has(input.skipReason)) return false;

  const state = getState(input.robotId);
  if (state.attempts >= MAX_ATTEMPTS) return false;
  if (state.lastAttemptAtMs > 0 && now - state.lastAttemptAtMs < ATTEMPT_COOLDOWN_MS) return false;

  return true;
}

/** Call once the runner actually starts a sequence, so the cooldown/
 * attempt count above is accurate for the next cycle. Returns the
 * 1-based attempt number, for wording the ask appropriately. */
export function noteFaceVisibilityAttempt(robotId: string, now = Date.now()): number {
  const state = getState(robotId);
  state.attempts += 1;
  state.lastAttemptAtMs = now;
  return state.attempts;
}

/** A usable face WAS seen (skipReason came back null, whether or not it
 * matched a known identity) — re-arm for next time, same as
 * LowLightAssistance resetting once the light recovers. */
export function resetFaceVisibilityState(robotId?: string) {
  if (robotId) stateByRobot.delete(robotId);
  else stateByRobot.clear();
}
