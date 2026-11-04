import { peopleRepository } from "../repositories/people.repository";
import { personFacesRepository } from "../repositories/personFaces.repository";
import { personObservationsRepository } from "../repositories/people-observations.repository";
import { robotRepository } from "../repositories/robot.repository";
import sharp from "sharp";
import { computeFaceEmbeddingDetailed, NoFaceDetectedError, type EmbeddingBoundingBox } from "../perception/faceEmbedding";
import { scoreFaceQuality } from "../perception/quality/faceQuality";
import { logger } from "../logging/Logger";
import type { RecognitionResult } from "../perception/personRecognition";

/**
 * PERSON ENCOUNTER LOG
 * --------------------
 * Runs on every brain cycle where a person is detected — whether or not
 * they stop to interact. This is what makes Vision "remember" people the
 * way the person asked for:
 *
 *   - First time seeing someone: a new person record is created
 *     automatically (name unset until they introduce themselves — see
 *     people/Introductions.ts), their face is registered for future
 *     recognition, and the encounter (photo + when + where) is logged.
 *   - Every time after that, recognizing the same face updates
 *     `lastSeen`/`visitCount` and appends another encounter row — so a
 *     person's profile builds up a full history: every day, every time,
 *     every place they were seen, with a photo each time.
 *
 * This never blocks or fails the brain cycle it's called from — a DB
 * hiccup here is logged and swallowed, same principle as
 * camera/visionStats.ts and CameraService's durable-analytics write.
 */

export interface EncounterInput {
  robotId: string;
  recognition: RecognitionResult;
  boundingBox?: EmbeddingBoundingBox;
  faceImageBuffer: Buffer;
  mediaId: string | null;
  talkedTo: boolean;
  confidence: number;
  context?: Record<string, unknown>;
}

export interface EncounterOutcome {
  personId: string;
  isNewPerson: boolean;
  name: string | null;
}

/** A person is only counted as a "new visit" (visitCount++) if this long
 * has passed since they were last seen — otherwise standing in frame for
 * ten consecutive brain cycles would inflate their visit count by ten. */
const NEW_VISIT_GAP_MS = 10 * 60 * 1000;

export class PersonEncounterService {
  async recordEncounter(input: EncounterInput): Promise<EncounterOutcome | null> {
    try {
      const robot = await robotRepository.findByCode(input.robotId);
      const location = robot?.currentLocation ?? null;

      let personId = input.recognition.personId;
      let name = input.recognition.name;
      let isNewPerson = false;

      if (!personId) {
        const created = await peopleRepository.create({ name: null, category: "UNKNOWN" });
        personId = created.id;
        name = null;
        isNewPerson = true;

        try {
          const cropped = input.boundingBox
            ? await sharp(input.faceImageBuffer, { failOn: "none" })
                .extract({
                  left: Math.max(0, Math.round(input.boundingBox.x)),
                  top: Math.max(0, Math.round(input.boundingBox.y)),
                  width: Math.max(1, Math.round(input.boundingBox.width)),
                  height: Math.max(1, Math.round(input.boundingBox.height)),
                })
                .jpeg()
                .toBuffer()
            : await sharp(input.faceImageBuffer, { failOn: "none" }).jpeg().toBuffer();
          const metadata = await sharp(cropped, { failOn: "none" }).metadata();

          const { embedding, detection, backendName } = await computeFaceEmbeddingDetailed(input.faceImageBuffer, input.boundingBox);
          const quality = await scoreFaceQuality(cropped, metadata.width ?? 0, metadata.height ?? 0, detection);
          await personFacesRepository.create({ personId, embedding, backend: backendName, mediaId: input.mediaId ?? null, qualityScore: quality.overallScore });
        } catch (embeddingErr) {
          // No clear face in this particular frame (turned away, too far,
          // motion blur, etc) — the person record and observation still
          // get created/logged below; recognition just won't have a face
          // to match against from this encounter. A later encounter with
          // a clearer frame will register one.
          if (!(embeddingErr instanceof NoFaceDetectedError)) {
            logger.warn("Face embedding failed while registering new person", { error: (embeddingErr as Error).message });
          }
        }
      } else {
        const existing = await peopleRepository.findById(personId);
        const lastSeenMs = existing?.lastSeen ? new Date(existing.lastSeen).getTime() : 0;
        const isNewVisit = Date.now() - lastSeenMs > NEW_VISIT_GAP_MS;
        await peopleRepository.update(personId, {
          lastSeen: new Date(),
          visitCount: (existing?.visitCount ?? 0) + (isNewVisit ? 1 : 0),
        });
      }

      await personObservationsRepository.record({
        personId,
        robotId: robot?.id ?? null,
        mediaId: input.mediaId,
        talkedTo: input.talkedTo,
        confidence: input.confidence,
        context: { location, ...input.context },
      });

      return { personId, isNewPerson, name };
    } catch (err) {
      logger.warn("Could not record person encounter (non-fatal)", { error: (err as Error).message });
      return null;
    }
  }
}

export const personEncounterService = new PersonEncounterService();
