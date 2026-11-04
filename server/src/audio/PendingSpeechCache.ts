/**
 * PENDING SPEECH CACHE
 * --------------------
 * `AudioService.speak()` already synthesizes real audio server-side, and
 * `CommandExecutor`'s AUDIO_SPEAK handler already calls it — but the
 * result only ever went back in the HTTP response to whoever dispatched
 * the command, which is fine for a dashboard preview and useless for the
 * robot's own speaker, which has no way to be "the caller" of a command
 * it's just polling for. This is the missing link: the synthesized audio
 * gets cached here, keyed by robot, and firmware's CommandPoller fetches
 * it via GET /api/audio/pending-speech right after seeing an AUDIO_SPEAK
 * command come through (see protocol/CommandPoller.cpp).
 *
 * One-shot per fetch (like AttentionController's force-capture flag) —
 * drained on read so a slow/offline robot doesn't build up a backlog of
 * stale things to say.
 */
export interface PendingSpeech {
  audioBase64: string;
  mimeType: string;
  /** "pcm16" is playable on this hardware today (raw 16-bit PCM straight
   * to the I2S speaker, no decoder needed) — see AudioManager::playChunk
   * on the firmware side. Both TTS providers send pcm16 in normal
   * operation now (see audio/TextToSpeech.ts) — "mp3" only shows up here
   * if EdgeTextToSpeech's own server-side transcode step failed (e.g. no
   * ffmpeg binary on this host); firmware has no on-device MP3 decoder,
   * so CommandPoller.cpp skips playback rather than feed compressed
   * bytes into a raw PCM buffer for that one utterance. */
  format: "pcm16" | "mp3";
  sampleRateHz: number;
}

import { EventEmitter } from "node:events";

/** Emits "speech" (robotId) when audio is cached so a live link can stream it right away. */
export const speechEvents = new EventEmitter();

const pendingByRobot = new Map<string, PendingSpeech>();

export function setPendingSpeech(robotId: string, speech: PendingSpeech) {
  pendingByRobot.set(robotId, speech);
  speechEvents.emit("speech", robotId);
}

export function takePendingSpeech(robotId: string): PendingSpeech | null {
  const speech = pendingByRobot.get(robotId);
  if (!speech) return null;
  pendingByRobot.delete(robotId);
  return speech;
}
