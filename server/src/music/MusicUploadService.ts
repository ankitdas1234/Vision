import { transcodeToPcm16 } from "../audio/audioTranscode";
import { detectBeats } from "../audio/beatDetection";
import { storeAudioMedia } from "../camera/mediaStorage";
import { musicTracksRepository, type MusicTrackRow } from "../repositories/musicTracks.repository";
import { setPendingSpeech } from "../audio/PendingSpeechCache";
import { logger } from "../logging/Logger";
import crypto from "crypto";

const PLAYBACK_SAMPLE_RATE_HZ = 16000; // matches the I2S speaker wiring — see audio/audioTranscode.ts

export interface UploadedTrackResult {
  track: MusicTrackRow;
  /** Real detected tempo confidence — see audio/beatDetection.ts. Surfaced
   * to the caller so a low-confidence detection can be flagged rather
   * than silently treated as gospel (e.g. the dashboard could show
   * "tempo detection uncertain" for a near-silent or very noisy file). */
  beatDetectionConfidence: number;
}

/**
 * MUSIC UPLOAD SERVICE
 * ---------------------
 * The only legitimate source of playable audio for the robot's physical
 * speaker (see docs/music.md for why YouTube/Spotify/etc. extraction was
 * explicitly ruled out): a file the user actually uploads. This is the
 * real pipeline, no gaps:
 *   1. Transcode to the exact PCM16 format the ESP32's I2S speaker plays
 *      (audio/audioTranscode.ts — the same tested path already used for
 *      TTS speech, so this needs zero firmware changes).
 *   2. Run real DSP beat detection on that PCM (audio/beatDetection.ts) —
 *      actual tempo/beat-grid extraction, not a guessed or fixed value.
 *   3. Store the original upload durably (same Google Drive + media_files
 *      pattern already used for camera photos — see
 *      camera/mediaStorage.ts's storeAudioMedia) and log the track,
 *      including its real detected BPM/beats, to the database.
 */
export class MusicUploadService {
  async uploadTrack(fileBuffer: Buffer, originalFilename: string, uploadedByUserId?: string | null): Promise<UploadedTrackResult> {
    const pcm16 = await transcodeToPcm16(fileBuffer, PLAYBACK_SAMPLE_RATE_HZ);
    const beats = detectBeats(pcm16, PLAYBACK_SAMPLE_RATE_HZ);
    const durationMs = Math.round((pcm16.length / 2 / PLAYBACK_SAMPLE_RATE_HZ) * 1000);
    const checksum = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    const stored = await storeAudioMedia(fileBuffer, originalFilename, { checksum });
    if (!stored.stored) {
      logger.debug("Audio upload not persisted to Drive (GOOGLE_DRIVE disabled) — track still logged with in-memory-only playback", { originalFilename });
    }

    const title = originalFilename.replace(/\.[^./]+$/, "");
    const track = await musicTracksRepository.create({
      title,
      uploadedByUserId,
      mediaId: stored.mediaId,
      durationMs,
      bpm: beats.bpm,
      beatConfidence: beats.confidence,
      beatTimestampsMs: beats.beatTimestampsMs,
      checksum,
    });

    logger.info("Music track uploaded and analyzed", { trackId: track.id, bpm: beats.bpm, confidence: beats.confidence, durationMs });
    return { track, beatDetectionConfidence: beats.confidence };
  }

  /** Queues the track's real PCM audio for the robot's speaker via the
   * same one-shot pending-audio cache TTS already uses (see
   * audio/PendingSpeechCache.ts) — firmware needs no changes, it already
   * knows how to play a pcm16 entry regardless of what produced it. */
  async queueForPlayback(robotId: string, fileBuffer: Buffer): Promise<void> {
    const pcm16 = await transcodeToPcm16(fileBuffer, PLAYBACK_SAMPLE_RATE_HZ);
    setPendingSpeech(robotId, {
      audioBase64: pcm16.toString("base64"),
      mimeType: "audio/pcm",
      format: "pcm16",
      sampleRateHz: PLAYBACK_SAMPLE_RATE_HZ,
    });
  }
}

export const musicUploadService = new MusicUploadService();
