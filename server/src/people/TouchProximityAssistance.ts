/**
 * "DON'T TOUCH ME" — reacting to something right up against the body
 * ----------------------------------------------------------------------
 * HONESTY NOTE, READ THIS FIRST: there is no touch/contact sensor on this
 * hardware. The full sensor list is a camera, a mic/speaker, and one
 * forward-facing HC-SR04 ultrasonic sensor (see
 * servos/ServoConfiguration.ts's physical-layout comment) — nothing that
 * can detect actual physical contact.
 *
 * This module does NOT detect touch. It uses the closest thing that
 * genuinely exists as a proxy: the ultrasonic sensor reading "VERY_CLOSE"
 * (<=50mm — see ultrasonic/UltrasonicSafety.ts's
 * DEFAULT_ULTRASONIC_THRESHOLDS.emergencyDistanceMm). At that distance
 * from a forward-facing sensor, a hand reaching toward the robot is the
 * most likely real-world cause — but it's a real measured proximity
 * value standing in for touch, not touch itself. It will also fire for a
 * held-up object, or someone simply standing extremely close without
 * touching anything. If real touch-sensing hardware (capacitive pads, a
 * pressure/force sensor on the body shell, etc.) is ever added, that
 * should replace or be OR'd alongside this trigger.
 */

/** Long enough not to re-trigger every single ~1s brain cycle while
 * contact/closeness continues (which would spam the gesture and the
 * speech line back-to-back); short enough to react again promptly if it
 * happens again after a brief gap. Deliberately much shorter than
 * LowLightAssistance's 90s ask-cooldown — this is a reflexive "back off"
 * reaction, not a considered request, and unlike that module this one
 * never gives up after N tries (see below) since persistent unwanted
 * contact should keep getting pushed back on for as long as it continues. */
export const REACT_COOLDOWN_MS = 4 * 1000;

interface RobotState {
  lastReactedAtMs: number;
}

const stateByRobot = new Map<string, RobotState>();

export interface TouchProximityInput {
  robotId: string;
  /** Pass `ultrasonicReading.status === "VERY_CLOSE"` — see the file
   * header for exactly what this does and doesn't mean. */
  veryCloseOnUltrasonic: boolean;
  now?: number;
}

/**
 * Returns true the moment this should react (and starts the cooldown) —
 * the caller should immediately play the recoil gesture and say
 * something like "please don't touch me" when this returns true.
 * Deliberately does NOT escalate/give-up the way LowLightAssistance
 * does: this re-fires every REACT_COOLDOWN_MS for as long as the
 * proximity condition keeps being true, rather than going quiet after a
 * few attempts.
 */
export function shouldReactToProximityContact(input: TouchProximityInput): boolean {
  const now = input.now ?? Date.now();
  if (!input.veryCloseOnUltrasonic) return false;

  const state = stateByRobot.get(input.robotId);
  if (state && now - state.lastReactedAtMs < REACT_COOLDOWN_MS) return false;

  stateByRobot.set(input.robotId, { lastReactedAtMs: now });
  return true;
}

/** Test/reset hook — also useful if a robot is re-seeded at runtime. */
export function resetTouchProximityState(robotId?: string) {
  if (robotId) stateByRobot.delete(robotId);
  else stateByRobot.clear();
}
