/**
 * The one interface both embedding backends implement. Everything
 * upstream (alignment, quality gating) and downstream (pgvector storage,
 * matching, voting) depends only on this — swapping backends is a config
 * change (FACE_EMBEDDING_BACKEND), not a code change, the same "swap
 * this, nothing else changes" seam the rest of this codebase already
 * uses for its pluggable detectors.
 */
export interface FaceEmbeddingBackend {
  readonly name: string;
  readonly dimensions: number;
  /** `alignedFacePng` must already be aligned (see embedding/alignment.ts)
   * and sized to whatever this backend's `inputSize` expects. */
  readonly inputSize: number;
  embed(alignedFacePng: Buffer): Promise<Float32Array>;
}
