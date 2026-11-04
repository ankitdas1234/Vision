import sharp from "sharp";
import { detectFace, decodeImage, type FaceDetectionResult } from "./faceDetection";
import { alignFace, getEmbeddingBackend } from "./embedding";
import { logger } from "../logging/Logger";

/**
 * FACE EMBEDDING — entry point
 * ------------------------------
 * Ties together, per call: crop to bounding box -> detect the actual
 * face + landmarks within it (perception/faceDetection.ts) -> align to
 * canonical pose (perception/embedding/alignment.ts) -> run the
 * configured embedding model (perception/embedding — face-api CNN by
 * default, real ONNX Runtime once FACE_EMBEDDING_BACKEND=onnx is set and
 * a model file is supplied).
 *
 * This file is intentionally the only thing the rest of the codebase
 * imports from (personRecognition.ts, PersonEncounterService.ts,
 * routes/people.routes.ts, BrainOrchestrator.ts) — swapping how
 * detection/alignment/embedding work internally never requires touching
 * those call sites, the same "swap this, nothing else changes" seam
 * documented in docs/architecture-map.md.
 */

export interface EmbeddingBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class NoFaceDetectedError extends Error {
  constructor() {
    super("No face detected in the supplied image region");
    this.name = "NoFaceDetectedError";
  }
}

async function cropToBoundingBox(imageBuffer: Buffer, boundingBox?: EmbeddingBoundingBox): Promise<Buffer> {
  if (!boundingBox || boundingBox.width <= 0 || boundingBox.height <= 0) {
    return sharp(imageBuffer, { failOn: "none" }).jpeg().toBuffer();
  }
  const image = sharp(imageBuffer, { failOn: "none" });
  const metadata = await image.metadata();
  const left = Math.max(0, Math.min(Math.round(boundingBox.x), (metadata.width ?? 1) - 1));
  const top = Math.max(0, Math.min(Math.round(boundingBox.y), (metadata.height ?? 1) - 1));
  const width = Math.max(1, Math.min(Math.round(boundingBox.width), (metadata.width ?? 1) - left));
  const height = Math.max(1, Math.min(Math.round(boundingBox.height), (metadata.height ?? 1) - top));
  return image.extract({ left, top, width, height }).jpeg().toBuffer();
}

export interface FaceEmbeddingComputation {
  embedding: number[];
  detection: FaceDetectionResult;
  backendName: string;
}

/** Aligns + embeds a face that's already been detected (e.g. by
 * qualityGate.ts, which needs the detection anyway for quality scoring)
 * — avoids running face detection twice on the same crop. */
export async function embedDetectedFace(croppedImageBuffer: Buffer, detection: FaceDetectionResult): Promise<{ embedding: number[]; backendName: string }> {
  const backend = getEmbeddingBackend();
  const target = scaledTarget(backend.inputSize);
  const aligned = await alignFace(croppedImageBuffer, detection, { outputSize: backend.inputSize, ...target });

  try {
    const vector = await backend.embed(aligned);
    return { embedding: Array.from(vector), backendName: backend.name };
  } catch (err) {
    logger.error("Embedding backend failed", { backend: backend.name, error: (err as Error).message });
    throw err;
  }
}

/**
 * Full detect -> align -> embed pipeline. Throws NoFaceDetectedError if
 * no face is found in the region — callers treat that as "can't
 * recognize this one," not a system failure (see personRecognition.ts).
 * Returns the detection alongside the embedding so callers that also
 * need quality scoring (quality/faceQuality.ts) don't have to
 * re-run detection themselves.
 */
export async function computeFaceEmbeddingDetailed(imageBuffer: Buffer, boundingBox?: EmbeddingBoundingBox): Promise<FaceEmbeddingComputation> {
  const cropped = await cropToBoundingBox(imageBuffer, boundingBox);
  const image = await decodeImage(cropped);

  const detection = await detectFace(image);
  if (!detection) throw new NoFaceDetectedError();

  const { embedding, backendName } = await embedDetectedFace(cropped, detection);
  return { embedding, detection, backendName };
}

function scaledTarget(outputSize: number) {
  const scale = outputSize / 112;
  return {
    leftEyeTarget: { x: 38.2946 * scale, y: 51.6963 * scale },
    rightEyeTarget: { x: 73.5318 * scale, y: 51.5014 * scale },
  };
}

/** Convenience wrapper for callers that only want the vector — the
 * overwhelming majority of call sites. */
export async function computeFaceEmbedding(imageBuffer: Buffer, boundingBox?: EmbeddingBoundingBox): Promise<number[]> {
  const result = await computeFaceEmbeddingDetailed(imageBuffer, boundingBox);
  return result.embedding;
}

/** Straight-line (Euclidean) distance between two embeddings. Lower
 * means more similar; 0 means identical. Works the same regardless of
 * which backend produced the vectors, as long as both sides of a
 * comparison came from the same backend/dimensionality (see
 * repositories/personFaces.repository.ts — embeddings are tagged with
 * the backend that produced them precisely so mismatched comparisons
 * can be refused rather than silently producing a meaningless number). */
export function faceDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY;
  let sumSquares = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sumSquares += d * d;
  }
  return Math.sqrt(sumSquares);
}

const DISTANCE_FLOOR = 1.2; // descriptors for unrelated faces rarely exceed this
export function similarityFromDistance(distance: number): number {
  if (!Number.isFinite(distance)) return 0;
  return Math.max(0, 1 - distance / DISTANCE_FLOOR);
}
