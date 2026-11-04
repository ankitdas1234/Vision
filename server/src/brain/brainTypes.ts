import type { Decision } from "../decisions/decisionTypes";
import type { Reaction, MentalState } from "../packages/types";
import type { CommandResult } from "../packages/types";
import type { AttentionSnapshot } from "../attention/attentionTypes";
import type { HeadCommand } from "../attention/HeadOrientationController";
import type { GestureName } from "../reactions/GestureExecutor";
import type { PresenceEventType } from "../ultrasonic/PresenceDetector";
import type { FrameDiscardReason } from "../camera/imageProcessor";
import type { NormalizedBox } from "../perception/motionDetection";
import type { EncounterOutcome } from "../people/PersonEncounterService";

/** Compact, dashboard-friendly summary of what the vision pipeline actually
 * saw and did this cycle — lets the frontend show *why* a cycle produced no
 * reaction (e.g. "frame discarded: too dark" vs "nothing moved" vs "person
 * seen but decided to ignore") instead of just a silent no-op. */
export interface PerceptionSummary {
  frameWidth: number;
  frameHeight: number;
  checksum: string;
  frameDiscarded: boolean;
  discardReason: FrameDiscardReason | null;
  detectionSkipped: boolean;
  meanBrightness: number;
  contrast: number;
  sharpness: number;
  motionDetected: boolean;
  motionMagnitude: number;
  motionRoi: NormalizedBox | null;
  personDetected: boolean;
  objectCount: number;
  presenceEvent: PresenceEventType;
  sensorsDisagree: boolean;
  attention: AttentionSnapshot;
  /** null only while in MANUAL mode, when the brain doesn't move the head at all. */
  headCommand: HeadCommand | null;
  /** Which embodied gesture (if any) was played this cycle to express the
   * current emotion — see reactions/GestureExecutor.ts. Null most cycles. */
  gesturePlayed: GestureName | null;
  /** The "could you turn a light on?" line spoken this cycle, if the room
   * was too dark and somebody was there to ask — see
   * perception/LowLightAssistance.ts. Null on almost every cycle. */
  lowLightPrompt: string | null;
}

export interface MediaOutcome {
  stored: boolean;
  mediaId: string | null;
  googleDriveFileId: string | null;
  googleDriveUrl: string | null;
}

export interface BrainCycleResult {
  observationId: string;
  decision: Decision;
  reaction: Reaction;
  mentalState: MentalState;
  commandResults: CommandResult[];
  perception: PerceptionSummary;
  media: MediaOutcome;
  /** Which person record (new or recalled) this cycle's encounter was
   * logged against, if a person was detected. Null when no person was in
   * frame this cycle. */
  encounter: EncounterOutcome | null;
}
