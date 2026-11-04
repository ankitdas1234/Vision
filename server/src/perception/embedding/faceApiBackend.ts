import path from "path";
import type * as faceapi from "@vladmandic/face-api";
import { loadFaceApi, loadCanvas } from "../nativeRuntime";
import type { FaceEmbeddingBackend } from "./types";
import { logger } from "../../logging/Logger";

/**
 * FaceRecognitionNet is a ResNet-34-style CNN, ported from dlib's
 * face_recognition_resnet_model, trained on roughly 3 million faces to
 * produce a 128-d descriptor where same-identity faces cluster together
 * under Euclidean distance. This is a genuine trained face-recognition
 * model — not the appearance-heuristic this pipeline used previously.
 *
 * It's the default backend because it's verified to download (see
 * scripts/download-face-models.js) and run correctly in this
 * environment without any external file the user has to source
 * themselves. See onnxBackend.ts for the swap-in path once a real
 * .onnx model is available.
 */
export class FaceApiEmbeddingBackend implements FaceEmbeddingBackend {
  readonly name = "face-api-resnet34";
  readonly dimensions = 128;
  readonly inputSize = 150; // face-api's net expects ~150x150 aligned input

  private modelsDir: string;
  private loadedPromise: Promise<void> | null = null;

  constructor(modelsDir: string = process.env.FACE_MODELS_DIR ?? path.join(__dirname, "../../../models/face-api")) {
    this.modelsDir = modelsDir;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loadedPromise) {
      this.loadedPromise = (async () => {
        // Canvas patching now lives in loadFaceApi() — see perception/nativeRuntime.ts.
        const api = await loadFaceApi();
        await api.nets.faceRecognitionNet.loadFromDisk(this.modelsDir);
        logger.info("FaceApiEmbeddingBackend model loaded", { modelsDir: this.modelsDir });
      })().catch((err) => {
        this.loadedPromise = null;
        throw err;
      });
    }
    return this.loadedPromise;
  }

  async embed(alignedFacePng: Buffer): Promise<Float32Array> {
    await this.ensureLoaded();
    const [api, { loadImage }] = await Promise.all([loadFaceApi(), loadCanvas()]);
    const image = await loadImage(alignedFacePng);
    const descriptor = await api.computeFaceDescriptor(image as unknown as faceapi.TNetInput);
    // computeFaceDescriptor can, depending on face-api version, return
    // either a single descriptor or an array when given ambiguous input;
    // this backend only ever calls it with a single pre-aligned face.
    const flat = Array.isArray(descriptor) ? descriptor[0] : descriptor;
    return flat as Float32Array;
  }
}
