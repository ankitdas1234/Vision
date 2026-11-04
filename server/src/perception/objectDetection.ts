import type { DetectionContext } from "./perceptionContext";
import { detectObjects } from "./objectDetectionModel";
import { logger } from "../logging/Logger";

export interface ObjectDetection {
  name: string;
  category: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}

export interface ObjectDetector {
  detect(ctx: DetectionContext): Promise<ObjectDetection[]>;
}

/**
 * Real trained-model object detection — CenterNet (COCO-80 classes) via
 * perception/objectDetectionModel.ts. Unlike the old heuristic below,
 * this can actually say *what* something is (up to COCO's 80 classes —
 * "chair," "cell phone," "backpack," etc, not an open vocabulary),
 * which is real, useful signal for MemoryManager's conceptual-memory
 * matching and CuriosityEngine's novelty scoring. "person" detections
 * are excluded here since perception/personDetection.ts's
 * LocalMLPersonDetector already owns that (same underlying model call,
 * not run twice — see brain/perception.ts).
 */
export class LocalMLObjectDetector implements ObjectDetector {
  async detect(ctx: DetectionContext): Promise<ObjectDetection[]> {
    try {
      const detections = await detectObjects(ctx.imageBuffer);
      return detections
        .filter((d) => d.label !== "person")
        .map((d) => ({ name: d.label, category: d.label, confidence: d.confidence, boundingBox: d.boundingBox }));
    } catch (err) {
      logger.warn("Local ML object detection failed, no objects reported this frame", { error: (err as Error).message });
      return [];
    }
  }
}

/**
 * Without a real classifier, the honest thing a local heuristic can say
 * about a foreground blob that isn't person-shaped is "something is here,
 * I don't know what" — never a specific label. Kept as an explicit
 * no-model-available fallback (see brain/perception.ts) for environments
 * where the real detector's model files aren't present or its native
 * TensorFlow binding failed to load.
 */
export class HeuristicObjectDetector implements ObjectDetector {
  async detect(ctx: DetectionContext): Promise<ObjectDetection[]> {
    const { motion } = ctx;
    if (!motion.present || !motion.roi) return [];

    const areaFraction = motion.roi.width * motion.roi.height;
    if (areaFraction < 0.005) return []; // too small to be a real object, likely noise

    const boundingBox = {
      x: Math.round(motion.roi.x * ctx.width),
      y: Math.round(motion.roi.y * ctx.height),
      width: Math.round(motion.roi.width * ctx.width),
      height: Math.round(motion.roi.height * ctx.height),
    };
    const confidence = Math.max(0.25, Math.min(0.6, motion.magnitude / 100));

    return [
      {
        name: "unidentified object",
        category: "unknown",
        confidence,
        boundingBox,
      },
    ];
  }
}

export class MockObjectDetector implements ObjectDetector {
  async detect(): Promise<ObjectDetection[]> {
    return [];
  }
}
