import sharp from "sharp";
import type { FaceDetectionResult, Point2D } from "../faceDetection";
import { faceRecognitionConfig } from "../../config/faceRecognitionConfig";

/**
 * FACE QUALITY GATE
 * -----------------
 * Runs AFTER face detection succeeds, BEFORE alignment/embedding. The
 * frame-level gate (camera/imageProcessor.ts) already rejected dark,
 * blown-out, or blank whole frames; this gate answers a narrower
 * question: "a face was found, but is *this particular face crop* good
 * enough to bother computing an identity embedding for?" A face can be
 * small, turned away, partly covered by a hand, or a webcam blur while
 * everything else about the frame looks fine — none of that shows up in
 * the whole-frame check.
 *
 * Every reject reason is returned, not just a boolean, so callers (and
 * logs/metrics) can see *why* frames are being skipped — the same
 * transparency principle as FrameDiscardReason in camera/imageProcessor.ts.
 */

export type FaceQualityRejectReason = "TOO_SMALL" | "LOW_DETECTOR_CONFIDENCE" | "EXCESSIVE_YAW" | "EXCESSIVE_PITCH" | "LIKELY_OCCLUDED" | "TOO_BLURRY";

export interface FaceQualityScore {
  isUsable: boolean;
  rejectReasons: FaceQualityRejectReason[];
  faceSizeFraction: number;
  estimatedYawDegrees: number;
  estimatedPitchDegrees: number;
  landmarkConsistency: number;
  sharpness: number;
  /** Single 0-1 composite for ranking multiple usable candidate frames
   * against each other (see qualityGate.ts's frame selection) — not used
   * for the accept/reject decision itself, which is reason-by-reason. */
  overallScore: number;
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Estimates yaw from horizontal eye/nose symmetry: on a camera-facing
 * face the nose sits roughly midway between the eyes; as the head turns,
 * the nose shifts toward one eye. This is a standard cheap proxy used by
 * lightweight pose-gating (full 3D pose estimation would need a 3D face
 * model + solvePnP, overkill for a keep/reject gate). Returns signed
 * degrees, clamped to a plausible range.
 */
function estimateYawDegrees(landmarks: FaceDetectionResult["landmarks5"]): number {
  const eyeSpan = distance(landmarks.leftEye, landmarks.rightEye);
  if (eyeSpan < 1) return 0;
  const eyeMidX = (landmarks.leftEye.x + landmarks.rightEye.x) / 2;
  const noseOffset = landmarks.nose.x - eyeMidX;
  // A nose offset equal to ~half the eye span corresponds to roughly a
  // 45-degree turn for a typical face geometry — an approximation, not a
  // calibrated measurement, which is why the gate stays conservative.
  const ratio = noseOffset / (eyeSpan / 2);
  return Math.max(-90, Math.min(90, ratio * 45));
}

/**
 * Estimates pitch from vertical nose position relative to the eye and
 * mouth lines: looking down brings the nose tip closer to the mouth
 * line, looking up moves it closer to the eye line.
 */
function estimatePitchDegrees(landmarks: FaceDetectionResult["landmarks5"]): number {
  const eyeY = (landmarks.leftEye.y + landmarks.rightEye.y) / 2;
  const mouthY = (landmarks.leftMouth.y + landmarks.rightMouth.y) / 2;
  const verticalSpan = mouthY - eyeY;
  if (verticalSpan < 1) return 0;
  const noseRatio = (landmarks.nose.y - eyeY) / verticalSpan; // ~0.5 when facing camera
  return Math.max(-90, Math.min(90, (noseRatio - 0.5) * 90));
}

/**
 * Landmark-consistency proxy for occlusion: a hand, mask, or object
 * covering part of the face tends to compress or distort the expected
 * spacing between landmark groups (eyes/nose/mouth no longer at their
 * expected relative distances). Returns 0-1, higher = more consistent
 * with an unoccluded face.
 */
function estimateLandmarkConsistency(landmarks68: Point2D[]): number {
  if (landmarks68.length < 68) return 0;
  const jaw = landmarks68.slice(0, 17);
  const jawWidth = distance(jaw[0], jaw[16]);
  if (jawWidth < 1) return 0;

  const leftEye = landmarks68.slice(36, 42);
  const rightEye = landmarks68.slice(42, 48);
  const mouth = landmarks68.slice(48, 68);

  const eyeSpan = distance(averagePoint(leftEye), averagePoint(rightEye));
  const mouthWidth = distance(mouth[0], mouth[6]);
  const noseToChin = distance(landmarks68[30], landmarks68[8]);

  // Typical face proportions, expressed relative to jaw width, from
  // average anthropometric ratios. Large deviation from these ratios
  // signals distortion consistent with partial occlusion.
  const eyeSpanRatio = eyeSpan / jawWidth; // expected ~0.45-0.55
  const mouthWidthRatio = mouthWidth / jawWidth; // expected ~0.30-0.40
  const noseChinRatio = noseToChin / jawWidth; // expected ~0.35-0.50

  const eyeScore = 1 - Math.min(1, Math.abs(eyeSpanRatio - 0.5) / 0.25);
  const mouthScore = 1 - Math.min(1, Math.abs(mouthWidthRatio - 0.35) / 0.2);
  const noseScore = 1 - Math.min(1, Math.abs(noseChinRatio - 0.42) / 0.25);

  return Math.max(0, (eyeScore + mouthScore + noseScore) / 3);
}

function averagePoint(points: Point2D[]): Point2D {
  return { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length };
}

/** Laplacian-variance-style sharpness on just the face crop — same
 * gradient-energy proxy as camera/imageProcessor.ts's whole-frame check,
 * scoped tighter so a sharp face in a slightly blurry frame still
 * passes, and vice versa a blurred face in an otherwise sharp frame
 * (motion blur from a head turn) correctly fails. */
async function faceSharpness(imageBuffer: Buffer, box: FaceDetectionResult["boundingBox"]): Promise<number> {
  const size = 64;
  const left = Math.max(0, Math.round(box.x));
  const top = Math.max(0, Math.round(box.y));
  const width = Math.max(1, Math.round(box.width));
  const height = Math.max(1, Math.round(box.height));

  const { data } = await sharp(imageBuffer, { failOn: "none" })
    .extract({ left, top, width, height })
    .resize(size, size, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let energy = 0;
  let samples = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      if (x + 1 < size) {
        energy += Math.abs(data[idx] - data[idx + 1]);
        samples++;
      }
      if (y + 1 < size) {
        energy += Math.abs(data[idx] - data[idx + size]);
        samples++;
      }
    }
  }
  return samples === 0 ? 0 : energy / samples;
}

export async function scoreFaceQuality(imageBuffer: Buffer, frameWidth: number, frameHeight: number, detection: FaceDetectionResult): Promise<FaceQualityScore> {
  const cfg = faceRecognitionConfig.faceQuality;
  const rejectReasons: FaceQualityRejectReason[] = [];

  const shorterSide = Math.min(frameWidth, frameHeight) || 1;
  const faceSizeFraction = Math.min(detection.boundingBox.width, detection.boundingBox.height) / shorterSide;
  if (faceSizeFraction < cfg.minFaceSizeFraction) rejectReasons.push("TOO_SMALL");

  if (detection.detectorConfidence < cfg.minDetectorConfidence) rejectReasons.push("LOW_DETECTOR_CONFIDENCE");

  const estimatedYawDegrees = estimateYawDegrees(detection.landmarks5);
  if (Math.abs(estimatedYawDegrees) > cfg.maxYawDegrees) rejectReasons.push("EXCESSIVE_YAW");

  const estimatedPitchDegrees = estimatePitchDegrees(detection.landmarks5);
  if (Math.abs(estimatedPitchDegrees) > cfg.maxPitchDegrees) rejectReasons.push("EXCESSIVE_PITCH");

  const landmarkConsistency = estimateLandmarkConsistency(detection.landmarks68);
  if (landmarkConsistency < cfg.minLandmarkConsistency) rejectReasons.push("LIKELY_OCCLUDED");

  const sharpness = await faceSharpness(imageBuffer, detection.boundingBox);
  if (sharpness < cfg.minFaceSharpness) rejectReasons.push("TOO_BLURRY");

  const sizeScore = Math.min(1, faceSizeFraction / (cfg.minFaceSizeFraction * 3));
  const poseScore = 1 - Math.min(1, (Math.abs(estimatedYawDegrees) / cfg.maxYawDegrees + Math.abs(estimatedPitchDegrees) / cfg.maxPitchDegrees) / 2);
  const sharpnessScore = Math.min(1, sharpness / (cfg.minFaceSharpness * 3));
  const overallScore = Math.max(0, (sizeScore + detection.detectorConfidence + poseScore + landmarkConsistency + sharpnessScore) / 5);

  return {
    isUsable: rejectReasons.length === 0,
    rejectReasons,
    faceSizeFraction,
    estimatedYawDegrees,
    estimatedPitchDegrees,
    landmarkConsistency,
    sharpness,
    overallScore,
  };
}
