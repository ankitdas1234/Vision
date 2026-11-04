import { commandRegistry } from "../commands/CommandRegistry";
import { taskManager } from "../tasks/TaskManager";
import { generateDanceSequence, generateBeatSyncedDanceSequence, DEFAULT_DANCE_DURATION_MS, type DanceFrame } from "./DanceChoreographer";
import { musicUploadService } from "../music/MusicUploadService";
import type { MusicTrackRow } from "../repositories/musicTracks.repository";
import { logger } from "../logging/Logger";

/**
 * "Vision, play a song and dance." Two real modes now exist:
 *   - `runDance` (below) — no audio file involved, fixed-tempo
 *     choreography plus a spoken announcement (AUDIO_SPEAK is TTS-only).
 *   - `runDanceToBeats` — a real uploaded track (see
 *     music/MusicUploadService.ts) is actually queued to the robot's
 *     speaker AND the choreography is synced to that track's real
 *     detected beats (audio/beatDetection.ts), not a guessed tempo.
 * Every frame goes through commandRegistry.dispatch exactly like a
 * manually-issued command, so SafetyManager/emergency-stop checks apply
 * the same way — the loop stops immediately if any dispatch fails rather
 * than continuing to hammer a robot that just e-stopped.
 */
export async function runDance(taskId: string, robotId: string, durationMs: number = DEFAULT_DANCE_DURATION_MS, trackId?: string) {
  taskManager.updateStatus(taskId, "RUNNING");

  await commandRegistry.dispatch({
    type: "AUDIO_SPEAK",
    params: { text: trackId ? `Playing ${trackId} — let's dance!` : "Let's dance!" },
    source: "SYSTEM",
    robotId,
    isAdmin: true,
  });

  await runSequence(taskId, robotId, generateDanceSequence(durationMs));
}

/**
 * Plays a real uploaded track's audio through the robot's speaker and
 * dances synced to that track's real detected beats. `fileBuffer` is the
 * same original upload `track` was analyzed from (see
 * MusicUploadService.uploadTrack) — passed here rather than re-fetched
 * from storage so this function doesn't need to know how/where the
 * original is persisted.
 *
 * Falls back to the fixed-tempo sequence if beat-detection confidence
 * was too low to trust (near-silent or arrhythmic audio) — dancing
 * off a shaky guess would look worse than the honest fallback.
 */
const MIN_BEAT_CONFIDENCE = 0.15;

export async function runDanceToBeats(taskId: string, robotId: string, track: MusicTrackRow, fileBuffer: Buffer) {
  taskManager.updateStatus(taskId, "RUNNING");

  await musicUploadService.queueForPlayback(robotId, fileBuffer);
  await commandRegistry.dispatch({
    type: "AUDIO_SPEAK",
    params: { text: `Playing ${track.title}!` },
    source: "SYSTEM",
    robotId,
    isAdmin: true,
  });

  const useBeatSync = track.beatConfidence >= MIN_BEAT_CONFIDENCE && track.beatTimestampsMs.length >= 2;
  if (!useBeatSync) {
    logger.info("Beat detection confidence too low, falling back to fixed-tempo dance", { trackId: track.id, confidence: track.beatConfidence });
  }
  const sequence = useBeatSync ? generateBeatSyncedDanceSequence(track.beatTimestampsMs) : generateDanceSequence(track.durationMs);

  await runSequence(taskId, robotId, sequence);
}

/** Shared frame-dispatch loop used by both dance modes — identical
 * safety/servo behavior either way, only the sequence's timing differs. */
async function runSequence(taskId: string, robotId: string, sequence: DanceFrame[]) {
  let framesCompleted = 0;

  for (const frame of sequence) {
    // One frame = head angle + both leg speeds, dispatched together
    // (Promise.all) so it lands as a single atomic pose/motion. The head
    // (EYE_SET, CH0) and the legs (LEFT/RIGHT_LEG_ROTATE, CH1/CH2) are
    // separate servos, so they don't compete.
    const results = await Promise.all([
      commandRegistry.dispatch({ type: "EYE_SET", params: { angle: frame.eyeAngle }, source: "SYSTEM", robotId, isAdmin: true }),
      commandRegistry.dispatch({ type: "LEFT_LEG_ROTATE", params: { speed: frame.leftRotationSpeed }, source: "SYSTEM", robotId, isAdmin: true }),
      commandRegistry.dispatch({ type: "RIGHT_LEG_ROTATE", params: { speed: frame.rightRotationSpeed }, source: "SYSTEM", robotId, isAdmin: true }),
    ]);

    if (results.some((r) => !r.success)) break; // e.g. emergency stop fired mid-dance
    framesCompleted++;
    await new Promise((r) => setTimeout(r, frame.holdMs));
  }

  // Otto Ninja's rotation servos are continuous (they spin, they don't
  // hold a position) — SERVOS_SAFE returns every servo to its safe
  // neutral/centered state so the robot doesn't keep spinning its legs
  // after the last frame's speed was set to something nonzero.
  await commandRegistry.dispatch({ type: "SERVOS_SAFE", params: {}, source: "SYSTEM", robotId, isAdmin: true });
  await commandRegistry.dispatch({ type: "AUDIO_STOP", params: {}, source: "SYSTEM", robotId, isAdmin: true });

  const completedFully = framesCompleted === sequence.length;
  taskManager.updateStatus(taskId, completedFully ? "COMPLETED" : "FAILED", {
    result: { framesCompleted, totalFrames: sequence.length },
    error: completedFully ? undefined : "Dance interrupted (safety stop or command failure)",
  });
}
