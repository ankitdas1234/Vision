import { servoManager, type ServoManager } from "../servos/ServoManager";
import { HEAD_CHANNEL, HEAD_MAX_DEG_PER_SEC } from "../servos/ServoConfiguration";
import { isWithinForwardFacingWindow } from "../ultrasonic/UltrasonicSafety";

/**
 * ============================================================
 * HEAD CONTROLLER (CH0 — the one servo that turns like a human head)
 * ============================================================
 * A single positional servo carries the camera and the HC-SR04, so
 * "looking" is just moving that servo: 0° = far left, 90° = straight
 * ahead, 180° = far right — a 180° field of view, with the legs free to
 * keep walking. Every EYE_* command (EYE_SET, EYE_LEFT, EYE_RIGHT,
 * EYE_CENTER, EYE_TRACK_PERSON) lands here.
 *
 * Unlike the legs this servo is positional, so the commanded angle IS the
 * real angle (no dead-reckoning)... eventually. The firmware eases toward
 * each target at HEAD_MAX_DEG_PER_SEC so the head turns smoothly like a
 * person's instead of snapping, which means a command "completes" instantly
 * on the server while the real head is still moving. Code that needs the head
 * to have ARRIVED (a scan that should dwell at each stop, or "look forward,
 * then walk") must wait for it — see headSettleRemainingMs() / waitForHeadSettled().
 */

let settledAtMs = 0; // epoch ms at which, by the speed model, the head reaches its last commanded angle

/** Time for the head to travel `degrees` at the firmware's turning speed. */
export function headTravelMs(degrees: number): number {
  return (Math.abs(degrees) / HEAD_MAX_DEG_PER_SEC) * 1000;
}

/** Current commanded head angle, 0-180 (90 = straight ahead). Process-local — single robot. */
export function getHeadAngle(servos: ServoManager = servoManager): number {
  return servos.getPositional(HEAD_CHANNEL).angle;
}

/** Turns the head to `targetAngle` (0-180). Throws ServoLimitError outside the servo's configured limits. */
export function setHeadAngle(targetAngle: number, servos: ServoManager = servoManager): number {
  const servo = servos.getPositional(HEAD_CHANNEL);
  const from = servo.angle;
  const angle = servo.setAngle(targetAngle);
  // Conservative: if an earlier move hasn't finished, add to it rather than guess where the head is now.
  settledAtMs = Math.max(Date.now(), settledAtMs) + headTravelMs(angle - from);
  return angle;
}

/** Looks straight ahead (90°). */
export function centerHead(servos: ServoManager = servoManager): number {
  const servo = servos.getPositional(HEAD_CHANNEL);
  const from = servo.angle;
  const angle = servo.center();
  settledAtMs = Math.max(Date.now(), settledAtMs) + headTravelMs(angle - from);
  return angle;
}

/** Milliseconds until the physical head should have reached its last commanded angle (0 = already there). */
export function headSettleRemainingMs(): number {
  return Math.max(0, settledAtMs - Date.now());
}

/** Resolves once the head has (by the speed model) arrived. Capped so a bad model can never stall a caller. */
export async function waitForHeadSettled(maxMs = 1000): Promise<void> {
  const wait = Math.min(headSettleRemainingMs(), maxMs);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

/** True when the head is within the forward-facing window, i.e. the ultrasonic reading describes the path ahead. */
export function isHeadForward(servos: ServoManager = servoManager): boolean {
  return isWithinForwardFacingWindow(getHeadAngle(servos));
}

/** Test helper — forget any in-flight head move. */
export function resetHeadSettle() { settledAtMs = 0; }
