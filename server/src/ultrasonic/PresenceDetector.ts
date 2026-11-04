import type { UltrasonicReading } from "../packages/types";

/**
 * PERIPHERAL PRESENCE SENSE
 * -------------------------
 * `UltrasonicSafety.ts` already answers "is it safe to move" — a reflex
 * that must never depend on vision. This module answers a different
 * question: "did something just become relevant enough to *look* at?"
 *
 * That's the human analogy for the HC-SR04 here — it's not an eye, it's
 * more like peripheral touch/proximity sense (the feeling of someone
 * stepping into your personal space, or a hand waved near your face)
 * that makes you turn your head *before* your eyes have confirmed
 * anything. AttentionController uses these events to decide when it's
 * worth commanding a camera capture at all, instead of the camera
 * capturing on a fixed timer regardless of whether anything is there.
 */

export type PresenceEventType = "ENTERED_NEAR_FIELD" | "LEFT_NEAR_FIELD" | "SUDDEN_APPROACH" | "NONE";

export interface PresenceEvent {
  type: PresenceEventType;
  distanceMm: number;
  deltaMm: number; // positive = getting closer since the previous reading
}

export interface PresenceThresholds {
  /** Distance within which something is considered "in range" and worth
   * looking at — loosely analogous to a personal-space bubble. */
  nearFieldMm: number;
  /** A closing-distance jump at least this large in one sample is treated
   * as a sudden approach worth an immediate look, even if already "near". */
  suddenApproachDeltaMm: number;
}

export const DEFAULT_PRESENCE_THRESHOLDS: PresenceThresholds = {
  nearFieldMm: 900,
  suddenApproachDeltaMm: 250,
};

const INVALID_STATES = new Set(["INVALID", "SENSOR_ERROR"]);

export function detectPresenceEvent(
  previous: UltrasonicReading | null,
  current: UltrasonicReading,
  thresholds: PresenceThresholds = DEFAULT_PRESENCE_THRESHOLDS,
): PresenceEvent {
  if (INVALID_STATES.has(current.status)) {
    return { type: "NONE", distanceMm: current.filteredDistanceMm, deltaMm: 0 };
  }

  const distanceMm = current.filteredDistanceMm;

  if (!previous || INVALID_STATES.has(previous.status)) {
    return {
      type: distanceMm <= thresholds.nearFieldMm ? "ENTERED_NEAR_FIELD" : "NONE",
      distanceMm,
      deltaMm: 0,
    };
  }

  const deltaMm = previous.filteredDistanceMm - distanceMm; // positive = closing in

  if (deltaMm >= thresholds.suddenApproachDeltaMm) {
    return { type: "SUDDEN_APPROACH", distanceMm, deltaMm };
  }

  const wasNear = previous.filteredDistanceMm <= thresholds.nearFieldMm;
  const isNear = distanceMm <= thresholds.nearFieldMm;

  if (isNear && !wasNear) return { type: "ENTERED_NEAR_FIELD", distanceMm, deltaMm };
  if (!isNear && wasNear) return { type: "LEFT_NEAR_FIELD", distanceMm, deltaMm };
  return { type: "NONE", distanceMm, deltaMm };
}

/** Tracks the previous reading per robot so callers don't have to. */
const lastReadingByRobot = new Map<string, UltrasonicReading>();

export function trackPresence(
  robotId: string,
  current: UltrasonicReading,
  thresholds?: PresenceThresholds,
): PresenceEvent {
  const previous = lastReadingByRobot.get(robotId) ?? null;
  const event = detectPresenceEvent(previous, current, thresholds);
  lastReadingByRobot.set(robotId, current);
  return event;
}

export function resetPresenceTrackingFor(robotId: string) {
  lastReadingByRobot.delete(robotId);
}
