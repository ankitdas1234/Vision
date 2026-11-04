import type { PersonCategory } from "../packages/types";
import { evaluateFrameForRecognition } from "./qualityGate";
import { embedDetectedFace } from "./faceEmbedding";
import { getEmbeddingBackend } from "./embedding";
import { personFacesRepository } from "../repositories/personFaces.repository";
import { multiFrameIdentityTracker, type IdentityStatus } from "./multiFrameIdentity";
import { faceRecognitionConfig } from "../config/faceRecognitionConfig";
import { logger } from "../logging/Logger";
import sharp from "sharp";

export interface RecognitionResult {
  personId: string | null;
  name: string | null;
  category: PersonCategory;
  confidence: number;
  /** CONFIRMED = multi-frame voting agreed, safe to act on (greetings,
   * trust-tier logic). PROVISIONAL = leaning toward someone but not yet
   * enough agreeing votes — treat the same as UNKNOWN for anything with
   * real consequences, this exists mainly for observability/UI. UNKNOWN
   * = no usable match, or the frame never made it past the quality gate. */
  status: IdentityStatus;
  skipReason: string | null;
}

export interface EmbeddingBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PersonRecognizer {
  recognize(faceRegion: Buffer, boundingBox?: EmbeddingBoundingBox, trackId?: string, frameWidth?: number, frameHeight?: number): Promise<RecognitionResult>;
}

export class MockPersonRecognizer implements PersonRecognizer {
  async recognize(): Promise<RecognitionResult> {
    // Unknown by default — recognizing someone never auto-grants ADMIN.
    return { personId: null, name: null, category: "UNKNOWN", confidence: 0.4, status: "UNKNOWN", skipReason: null };
  }
}

/** A candidate at or above this Euclidean distance is treated as "not a
 * match" regardless of how much closer it is than every other candidate
 * — nearest-of-a-bad-lot is still not a match. Deliberately conservative
 * (see docs/people.md) because misidentifying a stranger as a known
 * person has real consequences (trust tiers). Exported for
 * PersonSearchRunner.ts's photo-disambiguation matcher and
 * BrainOrchestrator.ts's disambiguation flow, which reuse the same
 * decision boundary. */
export const RECOGNITION_MATCH_THRESHOLD_DISTANCE = faceRecognitionConfig.matching.matchDistance;

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

/**
 * Full pipeline: quality gate (dedup + detect + face-quality) ->
 * alignment + real ML embedding -> pgvector nearest-neighbor search ->
 * multi-frame voting. A single call is one vote, not a decision — see
 * multiFrameIdentity.ts. `trackId` should identify "probably the same
 * continuous sighting" (see attention/AttentionController.ts); callers
 * without a real tracker can pass a per-robot constant, which degrades
 * gracefully to "vote across whoever's most recently been in frame" —
 * still safer than the old single-frame-decides behavior.
 */
export class EmbeddingPersonRecognizer implements PersonRecognizer {
  async recognize(faceRegion: Buffer, boundingBox?: EmbeddingBoundingBox, trackId = "default", frameWidth?: number, frameHeight?: number): Promise<RecognitionResult> {
    try {
      const cropped = await cropToBoundingBox(faceRegion, boundingBox);
      const metadata = await sharp(cropped, { failOn: "none" }).metadata();
      const width = frameWidth ?? metadata.width ?? 0;
      const height = frameHeight ?? metadata.height ?? 0;

      const gate = await evaluateFrameForRecognition(trackId, cropped, width, height);
      if (!gate.shouldProcess || !gate.detection) {
        // Not casting a vote here — an unusable frame isn't evidence of
        // "not this person," it's just no information at all. The
        // track's existing voting outcome (if any) is returned as-is.
        const outcome = multiFrameIdentityTracker.currentOutcome(trackId);
        return {
          personId: outcome.personId,
          name: null,
          category: "UNKNOWN",
          confidence: 0,
          status: outcome.status,
          skipReason: gate.skipReason,
        };
      }

      const { embedding } = await embedDetectedFace(cropped, gate.detection);
      const backend = getEmbeddingBackend();
      const candidates = await personFacesRepository.findNearest(embedding, backend.name, faceRecognitionConfig.voting.requiredAgreeingVotes * 4);

      const best = candidates[0] ?? null;
      const isMatch = best !== null && best.distance <= RECOGNITION_MATCH_THRESHOLD_DISTANCE;

      const vote = multiFrameIdentityTracker.castVote(trackId, { personId: isMatch ? best.personId : null, distance: best?.distance ?? Number.POSITIVE_INFINITY });

      if (vote.status === "CONFIRMED" && vote.personId) {
        const matchedCandidate = candidates.find((c) => c.personId === vote.personId) ?? best;
        return {
          personId: vote.personId,
          name: matchedCandidate?.name ?? null,
          category: (matchedCandidate?.category as PersonCategory) ?? "UNKNOWN",
          confidence: similarityFromVotes(vote.agreeingVotes, faceRecognitionConfig.voting.requiredAgreeingVotes),
          status: "CONFIRMED",
          skipReason: null,
        };
      }

      return {
        personId: null,
        name: null,
        category: "UNKNOWN",
        confidence: vote.agreeingVotes > 0 ? vote.agreeingVotes / faceRecognitionConfig.voting.requiredAgreeingVotes : 0,
        status: vote.status,
        skipReason: null,
      };
    } catch (err) {
      logger.warn("Face recognition lookup failed, treating as unknown", { error: (err as Error).message });
      return { personId: null, name: null, category: "UNKNOWN", confidence: 0, status: "UNKNOWN", skipReason: null };
    }
  }
}

function similarityFromVotes(agreeing: number, required: number): number {
  return Math.min(1, agreeing / required);
}
