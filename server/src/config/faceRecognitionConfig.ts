/**
 * FACE RECOGNITION PIPELINE — CONFIG
 * -----------------------------------
 * Every threshold the face pipeline uses, in one place, each overridable
 * via env var without touching code. Defaults are deliberately
 * conservative (biased toward rejecting a frame/match rather than
 * accepting a bad one) per the same philosophy as
 * camera/imageProcessor.ts's DEFAULT_FRAME_QUALITY_THRESHOLDS.
 */

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envString<T extends string>(name: string, fallback: T): T {
  const raw = process.env[name];
  return (raw as T) || fallback;
}

export const faceRecognitionConfig = {
  /** Which embedding backend actually computes the 128/512-d vector. See
   * perception/embedding/backends — 'faceapi' works out of the box
   * (verified-real dlib-ported CNN, models auto-downloadable); 'onnx'
   * requires a real .onnx face-recognition model file at
   * FACE_ONNX_MODEL_PATH (see perception/embedding/onnxBackend.ts for the
   * expected input/output shape). */
  embeddingBackend: envString<"faceapi" | "onnx">("FACE_EMBEDDING_BACKEND", "faceapi"),
  onnxModelPath: process.env.FACE_ONNX_MODEL_PATH ?? "",

  faceQuality: {
    /** Faces smaller than this fraction of the shorter frame dimension
     * produce unreliable embeddings — too few pixels of actual face
     * detail for the model to work with. */
    minFaceSizeFraction: envFloat("FACE_MIN_SIZE_FRACTION", 0.08),
    /** face-api TinyFaceDetector's own detection-confidence score. */
    minDetectorConfidence: envFloat("FACE_MIN_DETECTOR_CONFIDENCE", 0.6),
    /** Estimated yaw/pitch (degrees) beyond which the face is turned too
     * far from camera-facing for a reliable embedding. */
    maxYawDegrees: envFloat("FACE_MAX_YAW_DEGREES", 35),
    maxPitchDegrees: envFloat("FACE_MAX_PITCH_DEGREES", 30),
    /** Landmark-visibility-spread floor below which the face is judged
     * partially occluded (hand, mask, object in front of it). */
    minLandmarkConsistency: envFloat("FACE_MIN_LANDMARK_CONSISTENCY", 0.55),
    /** Laplacian-variance floor computed on just the face crop (tighter
     * than the whole-frame blur check in camera/imageProcessor.ts, since
     * a face can be sharp while the background is blurry or vice versa). */
    minFaceSharpness: envFloat("FACE_MIN_SHARPNESS", 25),
  },

  temporalDedup: {
    /** Perceptual-hash (dHash, 64-bit) Hamming-distance floor below which
     * two consecutive face crops are considered "the same frame, nothing
     * changed" and the later one is skipped rather than re-run through
     * detection/embedding/DB. 0 = identical, 64 = maximally different. */
    minHammingDistance: envInt("FACE_DEDUP_MIN_HAMMING_DISTANCE", 6),
    /** How long a per-track recent-hash history is kept before it's
     * treated as stale (person left and came back = new dedup window). */
    windowMs: envInt("FACE_DEDUP_WINDOW_MS", 15_000),
    /** How many recent hashes per track to compare against — guards
     * against a slow oscillation (e.g. blinking) repeatedly evading a
     * single-previous-frame comparison. */
    historySize: envInt("FACE_DEDUP_HISTORY_SIZE", 5),
  },

  matching: {
    /** Euclidean distance at/under which a candidate is considered a
     * match at all — see perception/personRecognition.ts. Distances
     * between this and REVIEW_DISTANCE are "maybe," never auto-confirmed. */
    matchDistance: envFloat("FACE_MATCH_DISTANCE", 0.5),
    /** Minimum registered faces a stored identity needs before it's
     * eligible to be matched against at all — a single reference photo
     * is too easy to false-positive against. */
    minReferenceFacesPerPerson: envInt("FACE_MIN_REFERENCE_FACES", 1),
    /** Cap on how many of a person's stored embeddings are compared per
     * candidate — keeps the DB-side ANN query bounded even for someone
     * with hundreds of registered faces (oldest/lowest-quality pruned
     * first — see repositories/personFaces.repository.ts). */
    maxStoredFacesPerPerson: envInt("FACE_MAX_STORED_PER_PERSON", 20),
  },

  voting: {
    /** How many independent frames must agree on the same person before
     * an identity is CONFIRMED rather than left PROVISIONAL/UNKNOWN. */
    requiredAgreeingVotes: envInt("FACE_VOTES_REQUIRED", 3),
    /** Total votes considered per track before the window resets — a
     * track that's cast this many votes without reaching consensus is
     * treated as genuinely ambiguous rather than kept open forever. */
    maxVotesPerTrack: envInt("FACE_VOTES_MAX", 8),
    /** How long an open voting track is kept before it's discarded as
     * stale (person walked off, track lost). */
    trackTtlMs: envInt("FACE_VOTE_TRACK_TTL_MS", 20_000),
  },
} as const;

export type FaceRecognitionConfig = typeof faceRecognitionConfig;
