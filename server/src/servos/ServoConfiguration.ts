export type ServoType = "POSITIONAL" | "CONTINUOUS";

/**
 * ============================================================
 * PHYSICAL SERVO LAYOUT — 3 servos, human-style
 * ============================================================
 *   CH0 — HEAD: positional servo, 0°-180°, 90° = looking straight ahead.
 *         The camera AND the HC-SR04 ultrasonic sensor ride on the head,
 *         so Vision looks around the way a person turns their head: a
 *         180° field of view, no need to turn the body to look.
 *   CH1 — LEFT LEG:  continuous-rotation servo (drives the left leg).
 *   CH2 — RIGHT LEG: continuous-rotation servo (drives the right leg).
 *
 * Walking  = both legs drive the same way.
 * Turning the BODY = legs drive opposite ways (TURN_LEFT / TURN_RIGHT).
 * Looking  = ONLY the head moves (EYE_SET / EYE_LEFT / EYE_RIGHT /
 *            EYE_CENTER / EYE_TRACK_PERSON), so the robot can look
 *            around WHILE walking. The head and the legs are separate
 *            servos and never compete.
 *
 * The EYE_* command names and the 0-180 angle convention are unchanged
 * from the original design (which also had a head servo), so everything
 * upstream — head SCAN/HOLD/TRACK logic, gestures, dance eye angles, the
 * Vision Script compiler, the dashboard — needs no change.
 *
 * There are no leg "joint" servos any more: the old LEFT/RIGHT_LEG_JOINT
 * and *_LEG_CENTER commands no longer exist.
 */

/** Servo channel assignments — single source of truth (firmware mirrors these in servo_config.h). */
export const HEAD_CHANNEL = 0;
export const LEG_CHANNELS = { left: 1, right: 2 } as const;

/**
 * How fast the head physically turns: the firmware eases toward each target at
 * this speed (HEAD_MAX_DEG_PER_SEC in firmware servo_config.h — keep in sync),
 * and the simulator uses the same number. A full 0-180° sweep takes 0.75 s.
 */
export const HEAD_MAX_DEG_PER_SEC = 240;

export interface PositionalServoConfig {
  channel: number;
  type: "POSITIONAL";
  minAngle: number;
  maxAngle: number;
  centerAngle: number;
  defaultAngle: number;
  directionInverted: boolean;
}

export interface ContinuousServoConfig {
  channel: number;
  type: "CONTINUOUS";
  neutralPwm: number;
  minPwm: number;
  maxPwm: number;
  defaultSpeed: number;
  directionInverted: boolean;
}

export type ServoConfig = PositionalServoConfig | ContinuousServoConfig;

/** Safe, conservative defaults. Real mechanical limits MUST be set via the calibration UI/API. */
export const DEFAULT_SERVO_CONFIGS: Record<number, ServoConfig> = {
  [HEAD_CHANNEL]: { channel: HEAD_CHANNEL, type: "POSITIONAL", minAngle: 0, maxAngle: 180, centerAngle: 90, defaultAngle: 90, directionInverted: false },
  [LEG_CHANNELS.left]: { channel: LEG_CHANNELS.left, type: "CONTINUOUS", neutralPwm: 307, minPwm: 205, maxPwm: 409, defaultSpeed: 50, directionInverted: false },
  [LEG_CHANNELS.right]: { channel: LEG_CHANNELS.right, type: "CONTINUOUS", neutralPwm: 307, minPwm: 205, maxPwm: 409, defaultSpeed: 50, directionInverted: false },
};

/**
 * ABSOLUTE HARDWARE TRUTH — do not change without updating firmware + seed data.
 * 1x ESP32-CAM, 1x PCA9685, exactly 3 servos (head + left leg + right leg),
 * 1x microphone, 1x speaker, 1x HC-SR04 ultrasonic sensor (on the head).
 */
