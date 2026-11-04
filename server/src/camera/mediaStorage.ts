import { googleDriveService } from "../google-drive/GoogleDriveService";
import { mediaFilesRepository } from "../repositories/mediaFiles.repository";
import { logger } from "../logging/Logger";

export interface StoredMedia {
  googleDriveFileId: string | null;
  googleDriveUrl: string | null;
  stored: boolean;
  /** DB id of the media_files row, when the DB write succeeds — this is
   * what person_observations.mediaId points at so a person's profile can
   * show the actual photo from each encounter. Null if the DB write
   * failed; the Drive upload itself is still considered successful. */
  mediaId: string | null;
}

/** Uploads camera media to Google Drive via the shared GoogleDriveService,
 * and durably records the resulting file (so other rows — person
 * observations, dashboards — have something stable to reference). Render's
 * filesystem is never treated as permanent storage; Drive + this DB row
 * are. */
export async function storeMedia(
  buffer: Buffer,
  filename: string,
  meta: { robotId?: string | null; checksum?: string; mediaType?: string } = {},
): Promise<StoredMedia> {
  const result = await googleDriveService.uploadImage(buffer, filename);

  let mediaId: string | null = null;
  try {
    const row = await mediaFilesRepository.create({
      robotId: meta.robotId ?? null,
      mediaType: meta.mediaType ?? "IMAGE",
      mimeType: "image/jpeg",
      filename,
      googleDriveFileId: result.googleDriveFileId,
      googleDriveUrl: result.googleDriveUrl,
      fileSize: buffer.length,
      checksum: meta.checksum ?? null,
    });
    mediaId = row.id;
  } catch (err) {
    // A DB hiccup here shouldn't fail the capture — the photo is already
    // safely in Drive; it just won't be linked to a person_observations row.
    logger.debug("Could not record media_files row (non-fatal)", { error: (err as Error).message });
  }

  return { googleDriveFileId: result.googleDriveFileId, googleDriveUrl: result.googleDriveUrl, stored: result.stored, mediaId };
}

/** Same as storeMedia, but for arbitrary audio files (e.g. a user-uploaded
 * track for music/MusicUploadService.ts) — uses GoogleDriveService's
 * audio upload path and records the real mimeType rather than assuming
 * image/jpeg. */
export async function storeAudioMedia(
  buffer: Buffer,
  filename: string,
  meta: { robotId?: string | null; checksum?: string; mimeType?: string } = {},
): Promise<StoredMedia> {
  const result = await googleDriveService.uploadAudio(buffer, filename);

  let mediaId: string | null = null;
  try {
    const row = await mediaFilesRepository.create({
      robotId: meta.robotId ?? null,
      mediaType: "AUDIO",
      mimeType: meta.mimeType ?? "audio/mpeg",
      filename,
      googleDriveFileId: result.googleDriveFileId,
      googleDriveUrl: result.googleDriveUrl,
      fileSize: buffer.length,
      checksum: meta.checksum ?? null,
    });
    mediaId = row.id;
  } catch (err) {
    logger.debug("Could not record media_files row for audio upload (non-fatal)", { error: (err as Error).message });
  }

  return { googleDriveFileId: result.googleDriveFileId, googleDriveUrl: result.googleDriveUrl, stored: result.stored, mediaId };
}
