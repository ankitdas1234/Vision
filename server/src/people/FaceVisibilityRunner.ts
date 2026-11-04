import { commandRegistry } from "../commands/CommandRegistry";
import { ultrasonicController } from "../ultrasonic/UltrasonicController";
import { noteFaceVisibilityAttempt } from "./FaceVisibilityAssistance";
import { logger } from "../logging/Logger";
import type { CommandType } from "../packages/types";

/**
 * Executes the actual "check it's safe, then back up a bit" sequence once
 * FaceVisibilityAssistance.shouldAttemptFaceVisibilityHelp() says to.
 *
 * WHY A FULL TURN-AROUND, NOT JUST A GLANCE: the camera and the HC-SR04
 * ride on the head, which sweeps 180° (0°-180°) — it can look left, right and
 * ahead but NOT behind the robot, and there is no rear sensor of any kind. So
 * the only honest way to check "is the space behind me clear before I back
 * into it" is to turn the whole body to face that way first, look, then turn
 * back. This uses the ordinary TURN_LEFT/TURN_RIGHT gait commands
 * (gait/GaitConfiguration.ts's DEFAULT_TURN_LEFT/RIGHT) — a real, if brief,
 * turning maneuver.
 *
 * SAFETY: every command below still goes through the normal
 * commandRegistry.dispatch -> SafetyManager -> ultrasonic-gating path, so
 * an emergency stop or a genuinely unsafe reading at dispatch time still
 * blocks it exactly like any other command — nothing here bypasses that.
 *
 * NOT INTERRUPTIBLE MID-SEQUENCE, ON PURPOSE: once started, this runs to
 * completion (a few seconds total) rather than re-checking "is a face
 * visible yet?" between steps. That keeps the behavior simple and
 * predictable — same design choice as the LOW_LIGHT_PEER gesture, which
 * also just plays through once started.
 */

/**
 * Rough, UNCALIBRATED duration meant to turn the body approximately 180
 * degrees using the existing TURN_LEFT/TURN_RIGHT gait phases. A placeholder
 * that needs measuring against real hardware (command a turn, see how far it
 * actually goes, rescale) — it is not derived from any real degrees-per-second
 * figure.
 */
export const TURN_AROUND_MS = 1800;

/** "A bit back" — short and cautious, not a real retreat. */
export const BACK_AWAY_WALK_MS = 1200;

/** Same bar SafetyManager/GaitController already use elsewhere for
 * "safe enough to move" — see ultrasonic/UltrasonicSafety.ts. */
const SAFE_TO_BACK_INTO: ReadonlySet<string> = new Set(["CLEAR", "NEAR"]);

async function dispatch(robotId: string, type: CommandType, params: Record<string, unknown> = {}) {
  return commandRegistry.dispatch({ type, params, source: "SYSTEM", robotId, isAdmin: true });
}

async function speak(robotId: string, text: string) {
  await dispatch(robotId, "AUDIO_SPEAK", { text });
}

/**
 * Runs the full sequence once. Never throws — any failure partway
 * through is logged and swallowed, same best-effort contract as
 * curiosity/ExplorationController.ts and people/PersonSearchRunner.ts,
 * since this is a background behavior, not something a caller should
 * have to handle failures from.
 */
export async function runFaceVisibilitySequence(robotId: string): Promise<void> {
  const attempt = noteFaceVisibilityAttempt(robotId);
  logger.info("Face not usable — starting check-and-back-away sequence", { robotId, attempt });

  try {
    // 1. Turn to point the forward-facing sensors at the space that
    //    would be backed into.
    await dispatch(robotId, "TURN_RIGHT", { durationMs: TURN_AROUND_MS });

    // 2. Fresh reading — not a stale one from before the turn.
    const behindReading = ultrasonicController.read();
    const groundClear = SAFE_TO_BACK_INTO.has(behindReading.status);

    // 3. Turn back the same amount to face the person again — otherwise
    //    the ask below would be spoken with its back to them.
    await dispatch(robotId, "TURN_LEFT", { durationMs: TURN_AROUND_MS });

    if (groundClear) {
      await dispatch(robotId, "WALK_BACKWARD", { durationMs: BACK_AWAY_WALK_MS });
      await dispatch(robotId, "WALK_STOP");
    } else {
      logger.info("Space behind isn't clear enough to back into — skipping the step back, asking directly instead", {
        robotId,
        behindStatus: behindReading.status,
      });
    }

    // 4. Whichever branch above ran, the actual goal (a usable face)
    //    still isn't met — ask outright rather than silently trailing off.
    const text =
      attempt === 1
        ? "I'm having trouble seeing your face clearly — could you come a little closer?"
        : "I still can't quite see your face. Could you come closer so I can see you properly?";
    await speak(robotId, text);
  } catch (err) {
    logger.warn("Face-visibility sequence failed partway through (non-fatal)", { robotId, error: (err as Error).message });
  }
}
