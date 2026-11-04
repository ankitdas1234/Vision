import { ultrasonicService } from "./UltrasonicService";
import { isMovementSafe as stateIsSafe, isWithinForwardFacingWindow } from "./UltrasonicSafety";
import { getHeadAngle } from "../attention/HeadController";

/**
 * How long a "clear ahead" reading stays trusted after the head turns away
 * from forward. The HC-SR04 rides on the head servo, so with the head turned
 * it measures a different direction. A person glancing sideways while
 * walking keeps going for a moment; a long stare sideways stops them.
 * Same here: glance (< this) and the walk continues, hold the head away
 * longer and movement fails closed until the head is back near centre.
 */
export const FORWARD_READING_MAX_AGE_MS = 800;

let lastForward: { safe: boolean; at: number } | null = null;

function recordIfForward(): boolean {
  const facingForward = isWithinForwardFacingWindow(getHeadAngle());
  if (facingForward) lastForward = { safe: stateIsSafe(ultrasonicService.getStatus()), at: Date.now() };
  return facingForward;
}

/** Test helper — forget the remembered forward reading. */
export function resetForwardReading() { lastForward = null; }

/** Thin façade consumed by SafetyManager/gait so callers don't reach into UltrasonicService internals. */
export const ultrasonicController = {
  read: () => ultrasonicService.getLast() ?? ultrasonicService.mockReading(),
  ingest: (rawMm: number) => {
    const reading = ultrasonicService.ingest(rawMm);
    recordIfForward();
    return reading;
  },
  /**
   * Head forward  -> live reading decides.
   * Head turned   -> only the most recent forward reading counts, and only
   *                  while it's fresh (FORWARD_READING_MAX_AGE_MS) and was safe.
   */
  isMovementSafe: () => {
    if (recordIfForward()) return stateIsSafe(ultrasonicService.getStatus());
    return !!lastForward && lastForward.safe && Date.now() - lastForward.at <= FORWARD_READING_MAX_AGE_MS;
  },
  enable: () => ultrasonicService.enable(),
  disable: () => ultrasonicService.disable(),
  calibrate: (patch: Parameters<typeof ultrasonicService.calibrate>[0]) => ultrasonicService.calibrate(patch),
  status: () => ultrasonicService.getStatus(),
};
