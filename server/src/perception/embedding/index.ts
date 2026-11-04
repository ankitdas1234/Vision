import { faceRecognitionConfig } from "../../config/faceRecognitionConfig";
import { FaceApiEmbeddingBackend } from "./faceApiBackend";
import { OnnxEmbeddingBackend } from "./onnxBackend";
import type { FaceEmbeddingBackend } from "./types";

export type { FaceEmbeddingBackend } from "./types";
export { alignFace, arcfaceTemplate } from "./alignment";

let cachedBackend: FaceEmbeddingBackend | null = null;

/** Picks the embedding backend named by FACE_EMBEDDING_BACKEND. Memoized
 * so model loading only happens once per process, same pattern as
 * perception/faceDetection.ts's model cache. */
export function getEmbeddingBackend(): FaceEmbeddingBackend {
  if (cachedBackend) return cachedBackend;
  cachedBackend = faceRecognitionConfig.embeddingBackend === "onnx" ? new OnnxEmbeddingBackend(faceRecognitionConfig.onnxModelPath) : new FaceApiEmbeddingBackend();
  return cachedBackend;
}

/** Test-only escape hatch to swap the memoized backend. */
export function __setEmbeddingBackendForTests(backend: FaceEmbeddingBackend | null): void {
  cachedBackend = backend;
}
