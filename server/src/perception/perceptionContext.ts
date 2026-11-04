import type { FrameQuality } from "../camera/imageProcessor";
import type { MotionResult } from "./motionDetection";

/**
 * Everything a detector needs to look at a frame the way a human would:
 * not just raw pixels, but also "is this even worth looking at" (quality)
 * and "did anything change" (motion) — the pre-attentive signals computed
 * once per frame and shared by every detector rather than recomputed.
 */
export interface DetectionContext {
  robotId: string;
  imageBuffer: Buffer;
  width: number;
  height: number;
  quality: FrameQuality;
  motion: MotionResult;
}
