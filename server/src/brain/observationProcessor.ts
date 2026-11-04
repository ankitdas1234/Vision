import { personDetector, personRecognizer, objectDetector } from "./perception";
import { analyzeFrame, type FrameQuality } from "../camera/imageProcessor";
import { getMotionDetectorFor, type MotionResult } from "../perception/motionDetection";
import type { DetectionContext } from "../perception/perceptionContext";
import type { PersonDetection } from "../perception/personDetection";
import type { ObjectDetection } from "../perception/objectDetection";
import type { RecognitionResult } from "../perception/personRecognition";

export interface ObservationResult {
  quality: FrameQuality;
  motion: MotionResult;
  /** The frame itself was unusable (blank/too dark/too bright/corrupt) — it
   * should never be stored or fed to detection/AI. This is the direct fix
   * for "the camera captures a lot of unused/blank photos". */
  frameDiscarded: boolean;
  /** The frame was fine, but nothing changed since the last look, so full
   * detection was skipped as unnecessary work — distinct from a bad frame. */
  detectionSkipped: boolean;
  person: PersonDetection;
  recognition: RecognitionResult | null;
  objects: ObjectDetection[];
}

const EMPTY_PERSON: PersonDetection = { personDetected: false };

/**
 * Sense -> orient -> attend -> detect -> recognize, in that order, for a
 * single frame. Each stage can short-circuit the rest, the same way a
 * human doesn't consciously identify objects in a scene they've already
 * dismissed as "nothing here" a moment ago.
 */
export async function processObservation(imageBuffer: Buffer, robotId = "vision-001"): Promise<ObservationResult> {
  const quality = await analyzeFrame(imageBuffer);

  if (!quality.isUsable) {
    return {
      quality,
      motion: { present: false, magnitude: 0, roi: null, cellsChanged: 0, totalCells: 0, isInitializing: false },
      frameDiscarded: true,
      detectionSkipped: true,
      person: EMPTY_PERSON,
      recognition: null,
      objects: [],
    };
  }

  const motion = getMotionDetectorFor(robotId).detect(quality.graySamples, quality.gridWidth, quality.gridHeight);

  // Run full detection on the very first frame for a scene (no baseline to
  // compare against yet) or whenever something actually changed. A static,
  // already-seen scene is intentionally not re-analyzed every cycle.
  const shouldDetect = motion.isInitializing || motion.present;
  if (!shouldDetect) {
    return {
      quality,
      motion,
      frameDiscarded: false,
      detectionSkipped: true,
      person: EMPTY_PERSON,
      recognition: null,
      objects: [],
    };
  }

  const ctx: DetectionContext = {
    robotId,
    imageBuffer,
    width: quality.width,
    height: quality.height,
    quality,
    motion,
  };

  const [person, objects] = await Promise.all([personDetector.detect(ctx), objectDetector.detect(ctx)]);
  const recognition = person.personDetected ? await personRecognizer.recognize(imageBuffer, person.boundingBox) : null;

  return { quality, motion, frameDiscarded: false, detectionSkipped: false, person, recognition, objects };
}
