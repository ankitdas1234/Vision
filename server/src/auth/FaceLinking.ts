import sharp from "sharp";
import { computeFaceEmbeddingDetailed, NoFaceDetectedError } from "../perception/faceEmbedding";
import { scoreFaceQuality } from "../perception/quality/faceQuality";
import { personFacesRepository } from "../repositories/personFaces.repository";
import { peopleRepository } from "../repositories/people.repository";
import { mediaFilesRepository } from "../repositories/mediaFiles.repository";
import { googleDriveService } from "../google-drive/GoogleDriveService";
import { faceRecognitionConfig } from "../config/faceRecognitionConfig";

/**
 * FACE LINKING
 * ------------
 * The one thing that makes "someone who met Vision in person" and
 * "someone who registers on the dashboard" become the SAME record
 * instead of two disconnected ones (see docs/people.md "One identity,
 * however you first met").
 *
 * This uses the same distance metric and the same
 * `faceRecognitionConfig.matching.matchDistance` threshold Vision's own
 * camera uses (`perception/personRecognition.ts`) — but NOT its
 * multi-frame voting safety net, since this runs against one deliberate
 * still capture, not a continuous video stream. See the ambiguity-margin
 * check below for how that gap is covered for this specific,
 * higher-stakes (account-linking, not just a greeting) use.
 *
 * Whichever direction someone meets Vision first — bumping into it in
 * the hallway, or clicking "allow camera" during signup — the second
 * encounter is meant to resolve back to the first `people` row rather
 * than creating a second one.
 *
 * Three possible outcomes, none of which throw for the "normal" cases
 * (no face / bad photo) — callers decide what that means for them (e.g.
 * AuthService.register treats them as "just leave the account
 * unlinked", not a registration failure):
 *   - NO_FACE: the frame didn't have a detectable face in it at all.
 *   - LOW_QUALITY: a face was found but it's too blurry/dark/small to
 *     trust as a reference photo (same quality gate used everywhere
 *     else faces get registered — perception/quality/faceQuality.ts).
 *   - LINKED: success. `matchedExisting` tells the caller whether this
 *     resolved to someone already on record or a brand new person.
 */

export type FaceLinkResult =
  | { status: "LINKED"; personId: string; matchedExisting: boolean }
  | { status: "NO_FACE" }
  | { status: "LOW_QUALITY"; reasons: string[] };

/** How much closer the best candidate must be than the closest candidate
 * belonging to a DIFFERENT person before the match is trusted outright.
 * Euclidean distance on the same normalized embedding space as
 * matchDistance itself — this is deliberately small (a real tie/near-tie
 * between two different people, not just "there happen to be other
 * people in the database somewhere below threshold too"). */
const AMBIGUITY_MARGIN = 0.05;

export async function matchOrCreatePersonForFace(imageBase64: string, fallbackName?: string): Promise<FaceLinkResult> {
  const buffer = Buffer.from(imageBase64, "base64");

  let embedding: number[];
  let backendName: string;
  let detection: Parameters<typeof scoreFaceQuality>[3];
  try {
    const computed = await computeFaceEmbeddingDetailed(buffer);
    embedding = computed.embedding;
    backendName = computed.backendName;
    detection = computed.detection;
  } catch (err) {
    if (err instanceof NoFaceDetectedError) return { status: "NO_FACE" };
    throw err;
  }

  const metadata = await sharp(buffer, { failOn: "none" }).metadata();
  const quality = await scoreFaceQuality(buffer, metadata.width ?? 0, metadata.height ?? 0, detection);
  if (!quality.isUsable) return { status: "LOW_QUALITY", reasons: quality.rejectReasons };

  // Stored once, up front, regardless of match-or-new — it becomes this
  // person's newest reference photo either way (see
  // personFaces.repository.ts's quality-based pruning for how old/lesser
  // reference photos eventually get dropped once there are enough good
  // ones).
  const upload = await googleDriveService.uploadImage(buffer, `face-link-${Date.now()}.jpg`);
  const media = await mediaFilesRepository.create({
    mediaType: "IMAGE",
    mimeType: "image/jpeg",
    filename: `face-link-${Date.now()}.jpg`,
    googleDriveFileId: upload.googleDriveFileId,
    googleDriveUrl: upload.googleDriveUrl,
    fileSize: buffer.length,
    checksum: upload.checksum,
    metadata: { kind: "ACCOUNT_FACE_LINK" },
  });

  // Same threshold, same idea as live recognition: distances at or under
  // matchDistance are trusted as "this is the same person", not just
  // "the closest of whoever's on record" — an empty/all-strangers
  // database correctly produces no match rather than a false one.
  //
  // One deliberate difference from live camera recognition: THIS is a
  // single still frame, not a video stream, so there's no multi-frame
  // voting (perception/multiFrameIdentity.ts) to fall back on — a
  // single ambiguous frame here can't just wait for the next frame to
  // break the tie. Account linking is also higher-stakes than a
  // greeting: getting it wrong doesn't just say the wrong name, it
  // merges two different people's visit history and learned facts onto
  // one account. So on top of the plain distance check, an ambiguity
  // guard: if a second candidate belongs to a DIFFERENT person and is
  // almost as close as the best match, this frame doesn't confidently
  // distinguish between them — treated as no match (a new person is
  // created) rather than a coin-flip guess between two real candidates.
  const candidates = await personFacesRepository.findNearest(embedding, backendName, 5);
  const best = candidates[0];
  const passesDistance = !!best && best.distance <= faceRecognitionConfig.matching.matchDistance;
  const runnerUp = candidates.find((c) => c.personId !== best?.personId);
  const isAmbiguous = passesDistance && !!runnerUp && runnerUp.distance - best!.distance < AMBIGUITY_MARGIN;
  const matchedExisting = passesDistance && !isAmbiguous;

  const personId = matchedExisting
    ? best.personId
    : (await peopleRepository.create({ name: fallbackName ?? null, category: "UNKNOWN" })).id;

  await personFacesRepository.create({ personId, embedding, backend: backendName, mediaId: media.id, qualityScore: quality.overallScore });

  return { status: "LINKED", personId, matchedExisting };
}
