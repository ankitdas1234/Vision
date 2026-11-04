import type { DetectionContext } from "./perceptionContext";
import { detectObjects } from "./objectDetectionModel";
import { logger } from "../logging/Logger";

export interface PersonDetection {
  personDetected: boolean;
  boundingBox?: { x: number; y: number; width: number; height: number };
  centerX?: number;
  centerY?: number;
  confidence?: number;
}

/**
 * Pluggable detector interface. In production this calls a vision model
 * or an on-device inference service; swap the implementation, not the
 * interface. The context carries the already-decoded frame quality and
 * motion ROI so no implementation needs to re-decode the image.
 */
export interface PersonDetector {
  detect(ctx: DetectionContext): Promise<PersonDetection>;
}

/**
 * Real trained-model person detection — CenterNet (COCO-80 classes) via
 * perception/objectDetectionModel.ts, filtered to the "person" class and
 * picking the highest-confidence instance. Replaces the shape/motion
 * heuristic below as the default (see brain/perception.ts's selection
 * logic) when no AI-vision API key is configured — this needs no API
 * key or network access at inference time, only the one-time model load
 * from disk.
 */
export class LocalMLPersonDetector implements PersonDetector {
  async detect(ctx: DetectionContext): Promise<PersonDetection> {
    let detections;
    try {
      detections = await detectObjects(ctx.imageBuffer);
    } catch (err) {
      logger.warn("Local ML object detection failed, no detection this frame", { error: (err as Error).message });
      return { personDetected: false };
    }

    const people = detections.filter((d) => d.label === "person");
    if (people.length === 0) return { personDetected: false };

    const best = people.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    return {
      personDetected: true,
      boundingBox: best.boundingBox,
      centerX: best.boundingBox.x + best.boundingBox.width / 2,
      centerY: best.boundingBox.y + best.boundingBox.height / 2,
      confidence: best.confidence,
    };
  }
}

/** A person-shaped foreground blob is taller than it is wide and reasonably
 * large relative to frame — the same coarse "is this roughly human-shaped"
 * heuristic used by early motion-based presence detectors before any
 * classifier model is involved. Kept as an explicit no-model-available
 * fallback (see brain/perception.ts) for environments where the real
 * detector's model files aren't present or its native TensorFlow binding
 * failed to load — never silently degraded to without a log line, since
 * confidence numbers from this path mean something different from the
 * real model's. */
const MIN_PERSON_AREA_FRACTION = 0.015; // ignore tiny blobs (bugs, noise)
const MIN_ASPECT_RATIO = 1.1; // height / width

export class HeuristicPersonDetector implements PersonDetector {
  async detect(ctx: DetectionContext): Promise<PersonDetection> {
    const { motion } = ctx;
    if (!motion.present || !motion.roi) return { personDetected: false };

    const areaFraction = motion.roi.width * motion.roi.height;
    const aspect = motion.roi.width === 0 ? 0 : motion.roi.height / motion.roi.width;
    if (areaFraction < MIN_PERSON_AREA_FRACTION || aspect < MIN_ASPECT_RATIO) {
      return { personDetected: false };
    }

    const boundingBox = {
      x: Math.round(motion.roi.x * ctx.width),
      y: Math.round(motion.roi.y * ctx.height),
      width: Math.round(motion.roi.width * ctx.width),
      height: Math.round(motion.roi.height * ctx.height),
    };
    // Confidence blends how "person-shaped" the blob is with how much it
    // actually moved — a stronger signal beats a borderline-shaped blob.
    const shapeConfidence = Math.min(1, aspect / 2.5);
    const motionConfidence = Math.min(1, motion.magnitude / 60);
    const confidence = Math.max(0.3, Math.min(0.85, (shapeConfidence + motionConfidence) / 2));

    return {
      personDetected: true,
      boundingBox,
      centerX: boundingBox.x + boundingBox.width / 2,
      centerY: boundingBox.y + boundingBox.height / 2,
      confidence,
    };
  }
}

/** Deterministic stand-in used by tests / MOCK_MODE. Ignores the frame
 * entirely on purpose — kept separate from the real detectors so tests
 * that want a guaranteed detection don't depend on real motion data or a
 * loaded model. */
export class MockPersonDetector implements PersonDetector {
  async detect(): Promise<PersonDetection> {
    return { personDetected: true, boundingBox: { x: 220, y: 100, width: 200, height: 400 }, centerX: 320, centerY: 300, confidence: 0.75 };
  }
}
