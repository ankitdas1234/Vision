import type { AttentionState, AttentionSnapshot, AttentionUpdateInput } from "./attentionTypes";

/**
 * ATTENTION CONTROLLER
 * --------------------
 * This is the piece that makes Vision "look" the way a human does instead
 * of the way a security camera does: a security camera samples on a fixed
 * timer forever. A human glances around slowly when nothing is happening,
 * snaps to attention when something brushes past or approaches, stays
 * fixated while something interesting is in view, and tunes out
 * (habituates) if the same nothing sits there for a while.
 *
 * `recommendedIntervalMs` is the concrete, actionable output: it's how
 * long to wait before the next capture. Reacting to it (instead of
 * capturing on a fixed timer) is most of the fix for "the camera takes
 * lots of unused photos" — Vision simply looks less often when there's
 * nothing to look at, and more often the moment something might be there.
 */

export interface AttentionIntervals {
  focusedMs: number;
  alertedMs: number;
  idleMs: number;
  habituatedMs: number;
}

export const DEFAULT_ATTENTION_INTERVALS: AttentionIntervals = {
  focusedMs: 350,
  alertedMs: 600,
  idleMs: 2000,
  habituatedMs: 5000,
};

/** Consecutive empty looks before attention downgrades from IDLE to HABITUATED. */
const HABITUATION_THRESHOLD = 5;

export class AttentionController {
  private state: AttentionState = "IDLE";
  private consecutiveEmpty = 0;
  private consecutiveInterest = 0;
  /** Set by an on-demand CAMERA_CAPTURE command (see CommandExecutor.ts);
   * consumed by GET /api/camera/schedule, which firmware's CaptureScheduler
   * polls — this is how a dashboard "capture now" click actually reaches
   * hardware that has no address the server can push to directly. */
  private forceCaptureRequested = false;

  constructor(private intervals: AttentionIntervals = DEFAULT_ATTENTION_INTERVALS) {}

  requestImmediateCapture() {
    this.forceCaptureRequested = true;
  }

  /** One-shot read: returns whether an immediate capture was requested
   * and clears the flag, so it fires exactly once rather than forcing
   * every subsequent poll until something else resets it. */
  consumeForceCaptureRequest(): boolean {
    const requested = this.forceCaptureRequested;
    this.forceCaptureRequested = false;
    return requested;
  }

  update(input: AttentionUpdateInput): AttentionSnapshot {
    let reason: string;

    if (input.personDetected || input.frameHadInterest || input.sensorsDisagree) {
      this.consecutiveInterest++;
      this.consecutiveEmpty = 0;
      this.state = "FOCUSED";
      reason = input.personDetected
        ? "person confirmed in frame"
        : input.sensorsDisagree
        ? "proximity sensor and camera disagree — worth a closer look"
        : "motion or visual interest detected";
    } else if (input.presenceEvent === "ENTERED_NEAR_FIELD" || input.presenceEvent === "SUDDEN_APPROACH") {
      this.consecutiveEmpty = 0;
      this.consecutiveInterest = 0;
      this.state = "ALERTED";
      reason = input.presenceEvent === "SUDDEN_APPROACH" ? "sudden approach on ultrasonic" : "something entered near field";
    } else {
      this.consecutiveInterest = 0;
      this.consecutiveEmpty++;
      if (this.consecutiveEmpty >= HABITUATION_THRESHOLD) {
        this.state = "HABITUATED";
        reason = `${this.consecutiveEmpty} empty looks in a row — tuning out an unchanging scene`;
      } else if (this.state === "FOCUSED" || this.state === "ALERTED") {
        this.state = "IDLE";
        reason = "nothing of interest since the last look";
      } else {
        reason = this.state === "HABITUATED" ? "still nothing new" : "no stimulus";
      }
    }

    return {
      state: this.state,
      recommendedIntervalMs: this.intervalFor(this.state),
      consecutiveEmptyFrames: this.consecutiveEmpty,
      consecutiveInterestFrames: this.consecutiveInterest,
      reason,
    };
  }

  private intervalFor(state: AttentionState): number {
    switch (state) {
      case "FOCUSED":
        return this.intervals.focusedMs;
      case "ALERTED":
        return this.intervals.alertedMs;
      case "HABITUATED":
        return this.intervals.habituatedMs;
      case "IDLE":
      default:
        return this.intervals.idleMs;
    }
  }

  getState(): AttentionState {
    return this.state;
  }

  /** Read-only peek at current state/interval without transitioning —
   * used by the capture-schedule endpoint so firmware can poll cadence
   * without that poll itself counting as an "empty look". */
  snapshot(): AttentionSnapshot {
    return {
      state: this.state,
      recommendedIntervalMs: this.intervalFor(this.state),
      consecutiveEmptyFrames: this.consecutiveEmpty,
      consecutiveInterestFrames: this.consecutiveInterest,
      reason: "snapshot (no update)",
    };
  }
  reset() {
    this.state = "IDLE";
    this.consecutiveEmpty = 0;
    this.consecutiveInterest = 0;
  }
}

/** One controller per robot — attention/habituation is scene-specific. */
const controllersByRobot = new Map<string, AttentionController>();

export function getAttentionControllerFor(robotId: string): AttentionController {
  let controller = controllersByRobot.get(robotId);
  if (!controller) {
    controller = new AttentionController();
    controllersByRobot.set(robotId, controller);
  }
  return controller;
}
