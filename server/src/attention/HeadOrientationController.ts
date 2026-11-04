import { computeTrackingStep, DEFAULT_TRACKING_CONFIG, type TrackingConfig } from "../perception/tracking";
import type { AttentionState } from "./attentionTypes";

/**
HEAD ORIENTATION (pure decision logic — actuation lives elsewhere)
 * ----------------
 * Decides what angle (0-180, 90 = straight ahead) the head SHOULD be facing.
 * The camera and the HC-SR04 ride on the head servo (CH0), so this is where
 * Vision looks. BrainOrchestrator dispatches the chosen angle as an
 * EYE_SET/EYE_TRACK_PERSON command and attention/HeadController.ts moves the
 * servo; the firmware eases the head there smoothly. This file is pure logic,
 * no servo I/O, fully testable without hardware.
 *
 * The brain does not run this while the legs are driving: the ultrasonic
 * sensor is on the head, so looking away mid-walk would trip the movement
 * safety rule (docs/ultrasonic.md).
 *
 * Three modes:
 *
 *   SCAN  — nothing going on: sweep slowly across the range, like idly
 *           glancing around a room. Widens effective coverage beyond the
 *           camera's field of view and gives the ultrasonic sensor
 *           a chance to notice something outside dead-ahead.
 *   HOLD  — something was sensed (ultrasonic) or seen (motion) but not yet
 *           pinned down precisely: stop scanning and keep both sensors
 *           trained on the current bearing, like turning toward a sound.
 *   TRACK — a person is confirmed in frame: fine-tune the angle using
 *           their on-screen position, same as looking someone in the eye
 *           and adjusting as they move (reuses perception/tracking.ts so
 *           server-driven and firmware on-device tracking agree).
 *
 * This is pure logic — no servo I/O here — so it's testable without
 * hardware and callable the same way from BrainOrchestrator (server) and
 * mirrored in firmware's CaptureScheduler (on-device).
 */

export type HeadCommandType = "SCAN" | "HOLD" | "TRACK";

export interface HeadCommand {
  type: HeadCommandType;
  angle: number;
  scanDirection: 1 | -1;
}

export interface ScanBounds {
  minAngle: number;
  maxAngle: number;
  stepDegrees: number;
}

/** Deliberately doesn't sweep to the mechanical extremes (0°/180°) — a
 * human doesn't crane their neck to its absolute limit just to glance
 * around either, and it keeps the servo away from its hard stops. */
export const DEFAULT_SCAN_BOUNDS: ScanBounds = { minAngle: 10, maxAngle: 170, stepDegrees: 8 };

export function nextScanAngle(
  currentAngle: number,
  direction: 1 | -1,
  bounds: ScanBounds = DEFAULT_SCAN_BOUNDS,
): { angle: number; direction: 1 | -1 } {
  let angle = currentAngle + direction * bounds.stepDegrees;
  let nextDirection = direction;
  if (angle >= bounds.maxAngle) {
    angle = bounds.maxAngle;
    nextDirection = -1;
  } else if (angle <= bounds.minAngle) {
    angle = bounds.minAngle;
    nextDirection = 1;
  }
  return { angle, direction: nextDirection };
}

export interface DecideHeadCommandInput {
  attentionState: AttentionState;
  currentAngle: number;
  scanDirection: 1 | -1;
  /** Detected person's horizontal center in frame pixels, if any. */
  personCenterX?: number;
  scanBounds?: ScanBounds;
  trackingConfig?: TrackingConfig;
}

export function decideHeadCommand(input: DecideHeadCommandInput): HeadCommand {
  const { attentionState, currentAngle, scanDirection, personCenterX } = input;

  if (attentionState === "FOCUSED" && typeof personCenterX === "number") {
    const step = computeTrackingStep(personCenterX, currentAngle, input.trackingConfig ?? DEFAULT_TRACKING_CONFIG);
    return { type: "TRACK", angle: step.angle, scanDirection };
  }

  if (attentionState === "FOCUSED" || attentionState === "ALERTED") {
    // Something is worth looking at but we don't have a precise on-screen
    // position to servo toward yet (e.g. ultrasonic-only, or an
    // unidentified object rather than a person) — hold the current bearing
    // rather than losing it mid-scan.
    return { type: "HOLD", angle: currentAngle, scanDirection };
  }

  // IDLE or HABITUATED — keep sweeping to widen coverage.
  const next = nextScanAngle(currentAngle, scanDirection, input.scanBounds);
  return { type: "SCAN", angle: next.angle, scanDirection: next.direction };
}
