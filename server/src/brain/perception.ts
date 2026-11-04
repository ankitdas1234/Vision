import { aiConfig } from "../config/ai";
import { HeuristicPersonDetector, LocalMLPersonDetector, type PersonDetector } from "../perception/personDetection";
import { HeuristicObjectDetector, LocalMLObjectDetector, type ObjectDetector } from "../perception/objectDetection";
import { AIVisionPersonDetector, AIVisionObjectDetector } from "../perception/aiVisionDetector";
import { MockPersonRecognizer, EmbeddingPersonRecognizer, type PersonRecognizer } from "../perception/personRecognition";
import { extractFeatures } from "../perception/featureExtraction";

/**
 * Detection (is something here) always runs locally — either via a real
 * trained object-detection model (LocalMLPersonDetector/
 * LocalMLObjectDetector, CenterNet/COCO-80, see
 * perception/objectDetectionModel.ts — no API key needed) or, if that's
 * explicitly disabled (OBJECT_DETECTION_BACKEND=heuristic — e.g. a
 * deployment where the model's native TensorFlow binding can't be
 * installed), the honest shape/motion-only heuristic. Recognition
 * (what specifically is it, beyond COCO's 80 classes) upgrades further
 * to a vision-capable AI model automatically once
 * OPENROUTER_VISION_MODEL is configured. Either way, the interface
 * downstream (BrainOrchestrator/observationProcessor) never changes.
 */
const useHeuristicFallback = process.env.OBJECT_DETECTION_BACKEND === "heuristic";

export const personDetector: PersonDetector = aiConfig.visionEnabled
  ? new AIVisionPersonDetector()
  : useHeuristicFallback
    ? new HeuristicPersonDetector()
    : new LocalMLPersonDetector();

export const objectDetector: ObjectDetector = aiConfig.visionEnabled
  ? new AIVisionObjectDetector()
  : useHeuristicFallback
    ? new HeuristicObjectDetector()
    : new LocalMLObjectDetector();

// Identity recognition (matching a detected person to a known person record)
// is a separate concern from "is there a person" — it depends on the
// person_faces embeddings table, which isn't populated in this codebase yet.
// Kept pluggable behind the same interface so wiring in a real face-embedding
// model later doesn't require touching the brain pipeline.
// Identity recognition (matching a detected person to a known person record)
// now actually queries the person_faces embeddings table (see
// perception/faceEmbedding.ts for what "embedding" means here, and
// routes/people.routes.ts for how a face gets registered in the first
// place). Falls back to UNKNOWN — never throws — if the DB is unreachable
// or no faces are registered yet, e.g. a fresh install or MOCK_MODE.
export const personRecognizer: PersonRecognizer = new EmbeddingPersonRecognizer();

// Exported for tests / anywhere a guaranteed-deterministic UNKNOWN result
// (no DB dependency at all) is preferable to the real recognizer above.
export { MockPersonRecognizer };

export { extractFeatures };
