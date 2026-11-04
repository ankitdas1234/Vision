import type { UltrasonicState } from "../packages/types";

export interface UltrasonicThresholds {
  safeDistanceMm: number;
  warningDistanceMm: number;
  stopDistanceMm: number;
  emergencyDistanceMm: number;
}

export const DEFAULT_ULTRASONIC_THRESHOLDS: UltrasonicThresholds = {
  safeDistanceMm: 600, warningDistanceMm: 300, stopDistanceMm: 150, emergencyDistanceMm: 50,
};

/**
 * Pure classification function — distance in, safety state out. Deliberately
 * has no dependency on ServoManager/SafetyManager so it can never be bypassed
 * by construction; callers (SafetyManager, gait) must consult it explicitly.
 */
export function classifyDistance(distanceMm: number | null, thresholds: UltrasonicThresholds = DEFAULT_ULTRASONIC_THRESHOLDS): UltrasonicState {
  if (distanceMm === null || Number.isNaN(distanceMm) || distanceMm < 0) return "INVALID";
  if (distanceMm <= thresholds.emergencyDistanceMm) return "VERY_CLOSE";
  if (distanceMm <= thresholds.stopDistanceMm) return "OBSTACLE";
  if (distanceMm <= thresholds.warningDistanceMm) return "WARNING";
  if (distanceMm <= thresholds.safeDistanceMm) return "NEAR";
  return "CLEAR";
}

/** Movement is only permitted when the obstacle state is CLEAR or NEAR. */
export function isMovementSafe(state: UltrasonicState): boolean {
  return state === "CLEAR" || state === "NEAR";
}

/**
 * The HC-SR04 rides on the head servo (CH0) with the camera, so it only
 * tells you what is ahead of the robot while the head is looking roughly
 * forward. FORWARD_FACING_WINDOW_DEGREES bounds how far off 90° the head can
 * be while a reading still counts as "the path ahead" for movement safety;
 * see ultrasonic/UltrasonicController.ts for how glances away are handled.
 */
export const FORWARD_FACING_WINDOW_DEGREES = 20;

export function isWithinForwardFacingWindow(
  currentPanAngleDeg: number,
  centerAngleDeg = 90,
  windowDegrees = FORWARD_FACING_WINDOW_DEGREES,
): boolean {
  return Math.abs(currentPanAngleDeg - centerAngleDeg) <= windowDegrees;
}

/**
 * Full movement-safety check including head orientation. `currentPanAngleDeg`
 * is optional so this remains backward compatible with any caller that
 * doesn't (yet) track head angle — but every real caller should supply it;
 * see ultrasonic/UltrasonicController.ts.
 */
export function isMovementSafeConsideringHeadAngle(
  state: UltrasonicState,
  currentPanAngleDeg?: number,
  centerAngleDeg = 90,
): boolean {
  if (currentPanAngleDeg !== undefined && !isWithinForwardFacingWindow(currentPanAngleDeg, centerAngleDeg)) {
    return false;
  }
  return isMovementSafe(state);
}
