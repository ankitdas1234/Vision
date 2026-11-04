import type { TrackingState } from "../packages/types";

export interface TrackingConfig {
  frameWidth: number;
  deadZonePx: number;
  smoothingFactor: number; // 0-1, higher = smoother/slower
  maxAnglePerStep: number;
  minAngle: number;
  maxAngle: number;
  targetLostGraceMs: number;
}

export const DEFAULT_TRACKING_CONFIG: TrackingConfig = {
  frameWidth: 640,
  deadZonePx: 30,
  smoothingFactor: 0.35,
  maxAnglePerStep: 6,
  minAngle: 0,
  maxAngle: 180,
  targetLostGraceMs: 1500,
};

/**
 * Pure function: given the person's detected center X and current eye angle,
 * compute the next eye angle. Mirrors the firmware's EyeTracker logic so
 * server-driven tracking commands and on-device tracking behave consistently.
 */
export function computeTrackingStep(personCenterX: number, currentAngle: number, cfg: TrackingConfig = DEFAULT_TRACKING_CONFIG) {
  const frameCenterX = cfg.frameWidth / 2;
  const error = personCenterX - frameCenterX;

  if (Math.abs(error) <= cfg.deadZonePx) {
    return { angle: currentAngle, moved: false, error };
  }

  // Normalize error to a bounded angle delta, then smooth.
  const rawDelta = (error / frameCenterX) * cfg.maxAnglePerStep;
  const smoothedDelta = rawDelta * (1 - cfg.smoothingFactor);
  const nextAngle = Math.min(cfg.maxAngle, Math.max(cfg.minAngle, currentAngle + smoothedDelta));
  return { angle: nextAngle, moved: true, error };
}

export function nextTrackingState(current: TrackingState, personDetected: boolean, msSinceLastSeen: number, cfg: TrackingConfig = DEFAULT_TRACKING_CONFIG): TrackingState {
  if (personDetected) {
    if (current === "IDLE" || current === "SEARCHING" || current === "REACQUIRING") return "TARGET_ACQUIRED";
    return "TRACKING";
  }
  if (current === "TRACKING" || current === "TARGET_ACQUIRED") {
    return msSinceLastSeen > cfg.targetLostGraceMs ? "TARGET_LOST" : current;
  }
  if (current === "TARGET_LOST") return "REACQUIRING";
  if (current === "REACQUIRING") return "SEARCHING";
  return "SEARCHING";
}
