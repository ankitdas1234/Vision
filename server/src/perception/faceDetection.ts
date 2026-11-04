import path from "path";
import type * as faceapi from "@vladmandic/face-api";
// The TF backend registration and the canvas monkey-patch both still
// happen — just on first use rather than at import time, so a machine
// without the native builds can still run everything that isn't vision.
// See perception/nativeRuntime.ts.
import { loadFaceApi, loadCanvas } from "./nativeRuntime";
import { logger } from "../logging/Logger";

/**
 * FACE DETECTION — real ML model
 * -------------------------------
 * TinyFaceDetector + a 68-point landmark model (face-api.js, ported from
 * dlib), both genuinely trained CNNs, not heuristics. This module owns
 * model loading so face-quality scoring (quality/faceQuality.ts) and
 * embedding/alignment (embedding/*.ts) share one detector instance and
 * one set of loaded weights instead of each loading their own.
 *
 * Model weights aren't bundled in the repo — see
 * scripts/download-face-models.js / `npm run setup:face-models`.
 */

const MODELS_DIR = process.env.FACE_MODELS_DIR ?? path.join(__dirname, "../../models/face-api");

export interface Point2D {
  x: number;
  y: number;
}

export interface FaceBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceDetectionResult {
  boundingBox: FaceBoundingBox;
  /** TinyFaceDetector's own detection-confidence score, 0-1. */
  detectorConfidence: number;
  /** All 68 landmark points, in face-api's standard ordering (jaw 0-16,
   * brows 17-26, nose 27-35, eyes 36-47, mouth 48-67). */
  landmarks68: Point2D[];
  /** The five points most pipelines actually need — eye centers, nose
   * tip, mouth corners — used for both pose estimation and alignment. */
  landmarks5: { leftEye: Point2D; rightEye: Point2D; nose: Point2D; leftMouth: Point2D; rightMouth: Point2D };
}

let modelsLoadedPromise: Promise<void> | null = null;

async function loadModels(): Promise<void> {
  // loadFaceApi() applies the canvas monkey-patch itself, so every
  // consumer gets it exactly once.
  const api = await loadFaceApi();
  await Promise.all([api.nets.tinyFaceDetector.loadFromDisk(MODELS_DIR), api.nets.faceLandmark68Net.loadFromDisk(MODELS_DIR), api.nets.faceRecognitionNet.loadFromDisk(MODELS_DIR)]);
  logger.info("Face detection/recognition models loaded", { modelsDir: MODELS_DIR });
}

/** Lazy, memoized, retry-on-failure model load — same pattern used
 * elsewhere in this codebase (see camera/CameraService's connection
 * bootstrap) so a missing models dir can be fixed and retried live. */
export async function ensureFaceModelsLoaded(): Promise<void> {
  if (!modelsLoadedPromise) {
    modelsLoadedPromise = loadModels().catch((err) => {
      modelsLoadedPromise = null;
      throw err;
    });
  }
  return modelsLoadedPromise;
}

function averagePoint(points: Point2D[]): Point2D {
  const x = points.reduce((s, p) => s + p.x, 0) / points.length;
  const y = points.reduce((s, p) => s + p.y, 0) / points.length;
  return { x, y };
}

function to5Point(landmarks68: Point2D[]): FaceDetectionResult["landmarks5"] {
  // face-api's standard 68-point layout: left eye 36-41, right eye 42-47
  // ("left"/"right" as seen on the subject's own face, i.e. mirrored in
  // frame), nose tip ~30, mouth corners 48 and 54.
  return {
    leftEye: averagePoint(landmarks68.slice(36, 42)),
    rightEye: averagePoint(landmarks68.slice(42, 48)),
    nose: landmarks68[30],
    leftMouth: landmarks68[48],
    rightMouth: landmarks68[54],
  };
}

/**
 * Detects the single most prominent face in `image` and returns its
 * bounding box, landmarks, and detector confidence. Returns null (not an
 * error) when no face is found — an empty/turned-away crop is an
 * expected, non-exceptional outcome here.
 */
export async function detectFace(image: faceapi.TNetInput): Promise<FaceDetectionResult | null> {
  await ensureFaceModelsLoaded();

  const api = await loadFaceApi();
  const detection = await api.detectSingleFace(image, new api.TinyFaceDetectorOptions({ inputSize: 224 })).withFaceLandmarks();
  if (!detection) return null;

  const box = detection.detection.box;
  const landmarks68 = detection.landmarks.positions.map((p) => ({ x: p.x, y: p.y }));

  return {
    boundingBox: { x: box.x, y: box.y, width: box.width, height: box.height },
    detectorConfidence: detection.detection.score,
    landmarks68,
    landmarks5: to5Point(landmarks68),
  };
}

export async function decodeImage(buffer: Buffer): Promise<faceapi.TNetInput> {
  const { loadImage } = await loadCanvas();
  return (await loadImage(buffer)) as unknown as faceapi.TNetInput;
}
