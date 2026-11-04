import type { PresenceEventType } from "../ultrasonic/PresenceDetector";

/**
 * IDLE        — nothing near, nothing seen recently: slow, occasional glances.
 * ALERTED     — peripheral sense (ultrasonic) says something is near/approaching:
 *               look more often, like turning toward a sound or touch.
 * FOCUSED     — vision actually found something interesting (motion, a person,
 *               an object): keep watching closely, like sustained eye contact.
 * HABITUATED  — repeated empty looks in a row: back off further than IDLE,
 *               like tuning out an unchanging scene.
 */
export type AttentionState = "IDLE" | "ALERTED" | "FOCUSED" | "HABITUATED";

export interface AttentionUpdateInput {
  presenceEvent: PresenceEventType;
  /** Cheap local signal: did the pre-attentive filters (motion/quality) find anything? */
  frameHadInterest: boolean;
  /** Did detection/recognition actually confirm a person? */
  personDetected: boolean;
  /** Ultrasonic and vision disagreeing (e.g. something is close but nothing
   * visible) is itself an interesting, attention-worthy signal. */
  sensorsDisagree: boolean;
}

export interface AttentionSnapshot {
  state: AttentionState;
  recommendedIntervalMs: number;
  consecutiveEmptyFrames: number;
  consecutiveInterestFrames: number;
  reason: string;
}
