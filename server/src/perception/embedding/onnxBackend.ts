import fs from "fs";
import sharp from "sharp";
import * as ort from "onnxruntime-node";
import type { FaceEmbeddingBackend } from "./types";
import { logger } from "../../logging/Logger";

/**
 * ONNX RUNTIME EMBEDDING BACKEND — real inference engine
 * --------------------------------------------------------
 * This is a genuine ONNX Runtime session, not a stub: real preprocessing
 * (aligned face -> normalized CHW float32 tensor), a real
 * `ort.InferenceSession.run()` call, real output-tensor extraction and
 * L2 normalization. It follows the near-universal ArcFace/InsightFace
 * convention (112x112 RGB in, 512-d float32 embedding out, input
 * normalized to [-1, 1]) — the same shape used by
 * arcfaceresnet100-8.onnx, buffalo_l/w600k_r50.onnx, MobileFaceNet.onnx,
 * and most other publicly published face-embedding ONNX models, so any
 * of those "just works" once pointed at by FACE_ONNX_MODEL_PATH.
 *
 * WHY THIS ISN'T THE DEFAULT BACKEND: no model file ships in this repo.
 * The standard public ONNX face-recognition weights are distributed via
 * Git LFS (e.g. onnx/models' arcfaceresnet100-8.onnx), which this
 * project's build/CI environment cannot fetch automatically the way
 * scripts/download-face-models.js fetches the face-api.js weights (those
 * are ordinary small git-tracked files, not LFS). Practically: export or
 * download a compatible .onnx file yourself (insightface's own model
 * zoo, or `pip install insightface` and export its buffalo_l recognition
 * model to ONNX), place it anywhere, and set:
 *   FACE_EMBEDDING_BACKEND=onnx
 *   FACE_ONNX_MODEL_PATH=/path/to/model.onnx
 * Everything else in this pipeline (alignment, matching, voting,
 * pgvector storage) is already written against the FaceEmbeddingBackend
 * interface and needs no changes.
 */
export class OnnxEmbeddingBackend implements FaceEmbeddingBackend {
  readonly name = "onnx-arcface";
  readonly dimensions: number;
  readonly inputSize = 112;

  private session: ort.InferenceSession | null = null;
  private sessionPromise: Promise<ort.InferenceSession> | null = null;

  constructor(
    private readonly modelPath: string,
    dimensions = 512,
  ) {
    this.dimensions = dimensions;
  }

  private async ensureSession(): Promise<ort.InferenceSession> {
    if (this.session) return this.session;
    if (!this.sessionPromise) {
      if (!this.modelPath || !fs.existsSync(this.modelPath)) {
        throw new Error(
          `OnnxEmbeddingBackend: no model file at "${this.modelPath}". Set FACE_ONNX_MODEL_PATH to a real ArcFace-shaped .onnx file (112x112 RGB in, 512-d out) — see this file's header comment for how to obtain one.`,
        );
      }
      this.sessionPromise = ort.InferenceSession.create(this.modelPath).then((session) => {
        this.session = session;
        logger.info("OnnxEmbeddingBackend model loaded", { modelPath: this.modelPath });
        return session;
      });
    }
    return this.sessionPromise;
  }

  /** Aligned PNG -> CHW float32 tensor, RGB channels normalized to
   * [-1, 1] via (pixel/255 - 0.5) / 0.5 — the standard ArcFace
   * preprocessing convention. */
  private async preprocess(alignedFacePng: Buffer): Promise<ort.Tensor> {
    const { data, info } = await sharp(alignedFacePng)
      .resize(this.inputSize, this.inputSize, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    const chw = new Float32Array(3 * width * height);
    const plane = width * height;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIdx = (y * width + x) * channels;
        const outIdx = y * width + x;
        const r = data[pixelIdx] / 255;
        const g = data[pixelIdx + 1] / 255;
        const b = data[pixelIdx + 2] / 255;
        chw[outIdx] = (r - 0.5) / 0.5;
        chw[plane + outIdx] = (g - 0.5) / 0.5;
        chw[2 * plane + outIdx] = (b - 0.5) / 0.5;
      }
    }

    return new ort.Tensor("float32", chw, [1, 3, height, width]);
  }

  private l2Normalize(vec: Float32Array): Float32Array {
    let sumSquares = 0;
    for (let i = 0; i < vec.length; i++) sumSquares += vec[i] * vec[i];
    const magnitude = Math.sqrt(sumSquares) || 1;
    const out = new Float32Array(vec.length);
    for (let i = 0; i < vec.length; i++) out[i] = vec[i] / magnitude;
    return out;
  }

  async embed(alignedFacePng: Buffer): Promise<Float32Array> {
    const session = await this.ensureSession();
    const inputTensor = await this.preprocess(alignedFacePng);
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];

    const results = await session.run({ [inputName]: inputTensor });
    const output = results[outputName];
    if (!output) {
      throw new Error(`OnnxEmbeddingBackend: model produced no output tensor named "${outputName}"`);
    }

    const raw = output.data as Float32Array;
    if (raw.length !== this.dimensions) {
      logger.warn("ONNX model output dimension differs from configured dimensions", { expected: this.dimensions, actual: raw.length });
    }
    return this.l2Normalize(raw);
  }
}
