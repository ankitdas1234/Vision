import { detectFace, decodeImage, type FaceDetectionResult } from "./faceDetection";
import { scoreFaceQuality, type FaceQualityScore } from "./quality/faceQuality";
import { temporalDeduplicator } from "./quality/temporalDeduplication";
import { logger } from "../logging/Logger";

/**
 * FACE PIPELINE QUALITY GATE
 * ---------------------------
 * The single entry point that decides "is this frame worth running
 * embedding + a database round-trip for at all?" Runs cheapest-to-most-
 * expensive, bailing out at the first reason to skip:
 *
 *   1. Temporal dedup (perceptual hash) — cheapest, catches "nothing
 *      changed since last frame" before touching any ML model at all.
 *   2. Face detection — needed either way to know if there's a face,
 *      but detection alone is far cheaper than alignment+embedding.
 *   3. Face-quality scoring — geometry/sharpness checks on the already-
 *      detected face, still cheaper than running the embedding model.
 *
 * Only a frame that clears all three goes on to
 * perception/faceEmbedding.ts's alignment+embedding step. This is what
 * keeps the pipeline from spending bandwidth/CPU/GPU/DB writes on every
 * single camera frame — see camera/imageProcessor.ts for the equivalent
 * whole-frame-level gate this sits downstream of.
 */

export type SkipReason = "DUPLICATE_FRAME" | "NO_FACE_DETECTED" | FaceQualityScore["rejectReasons"][number];

export interface QualityGateResult {
  shouldProcess: boolean;
  skipReason: SkipReason | null;
  detection: FaceDetectionResult | null;
  qualityScore: FaceQualityScore | null;
}

export async function evaluateFrameForRecognition(trackId: string, imageBuffer: Buffer, frameWidth: number, frameHeight: number): Promise<QualityGateResult> {
  const dedup = await temporalDeduplicator.check(trackId, imageBuffer);
  if (dedup.isDuplicate) {
    return { shouldProcess: false, skipReason: "DUPLICATE_FRAME", detection: null, qualityScore: null };
  }

  let detection: FaceDetectionResult | null;
  try {
    const image = await decodeImage(imageBuffer);
    detection = await detectFace(image);
  } catch (err) {
    logger.warn("Face detection failed during quality gate", { trackId, error: (err as Error).message });
    return { shouldProcess: false, skipReason: "NO_FACE_DETECTED", detection: null, qualityScore: null };
  }

  if (!detection) {
    return { shouldProcess: false, skipReason: "NO_FACE_DETECTED", detection: null, qualityScore: null };
  }

  const qualityScore = await scoreFaceQuality(imageBuffer, frameWidth, frameHeight, detection);
  if (!qualityScore.isUsable) {
    return { shouldProcess: false, skipReason: qualityScore.rejectReasons[0], detection, qualityScore };
  }

  return { shouldProcess: true, skipReason: null, detection, qualityScore };
}
