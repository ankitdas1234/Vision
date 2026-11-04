import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/authorization";
import { musicUploadService } from "../music/MusicUploadService";
import { musicTracksRepository } from "../repositories/musicTracks.repository";
import { taskManager } from "../tasks/TaskManager";
import { runDanceToBeats } from "../performance/DanceRunner";

/**
 * Real, user-uploaded audio only (base64 in the JSON body, matching this
 * codebase's existing upload convention — see routes/people.routes.ts's
 * face-image upload). No YouTube/Spotify/etc. integration: see
 * docs/music.md for why that's a hard boundary, not a missing feature.
 */
export const musicRouter = Router();
musicRouter.use("/music", requireAuth);

// TRUSTED can upload a track for playback; matches the bar already set
// for other audio actions (AUDIO_SPEAK etc — see routes/audio.routes.ts).
musicRouter.post("/music/tracks", requireRole("TRUSTED"), async (req: AuthedRequest, res) => {
  const { audioBase64, filename } = req.body ?? {};
  if (typeof audioBase64 !== "string" || typeof filename !== "string") {
    return res.status(400).json({ code: "INVALID_UPLOAD", message: "audioBase64 and filename are required" });
  }

  try {
    const buffer = Buffer.from(audioBase64, "base64");
    const result = await musicUploadService.uploadTrack(buffer, filename, req.user?.id ?? null);
    res.status(201).json({
      track: result.track,
      beatDetectionConfidence: result.beatDetectionConfidence,
      warning: result.beatDetectionConfidence < 0.15 ? "Tempo detection was low-confidence for this file — dancing will use a fixed tempo instead of synced beats." : undefined,
    });
  } catch (err) {
    res.status(422).json({ code: "AUDIO_PROCESSING_FAILED", message: (err as Error).message });
  }
});

musicRouter.get("/music/tracks", requireRole("TRUSTED"), async (_req, res) => {
  res.json(await musicTracksRepository.list());
});

musicRouter.get("/music/tracks/:id", requireRole("TRUSTED"), async (req, res) => {
  const track = await musicTracksRepository.findById(req.params.id);
  if (!track) return res.status(404).json({ code: "NOT_FOUND" });
  res.json(track);
});

// Plays a previously-uploaded track and dances synced to its real
// detected beats (see performance/DanceRunner.ts's runDanceToBeats). The
// original audio bytes must be re-supplied here (base64) rather than
// re-fetched from Drive server-side — see MusicUploadService.queueForPlayback's
// comment for why the DB only stores the analysis, not the replayable audio.
musicRouter.post("/music/tracks/:id/play", requireRole("TRUSTED"), async (req: AuthedRequest, res) => {
  const track = await musicTracksRepository.findById(req.params.id);
  if (!track) return res.status(404).json({ code: "NOT_FOUND" });

  const { audioBase64, robotId } = req.body ?? {};
  if (typeof audioBase64 !== "string") {
    return res.status(400).json({ code: "INVALID_REQUEST", message: "audioBase64 (the same file originally uploaded for this track) is required to play it" });
  }

  const targetRobotId = typeof robotId === "string" ? robotId : "vision-001";
  const task = taskManager.create({ robotId: targetRobotId, taskType: "DANCE", input: { trackId: track.id, title: track.title }, description: `Play ${track.title} and dance` });

  const buffer = Buffer.from(audioBase64, "base64");
  runDanceToBeats(task.id, targetRobotId, track, buffer).catch((err) => taskManager.updateStatus(task.id, "FAILED", { error: (err as Error).message }));

  res.json({ taskId: task.id, status: "PENDING", bpm: track.bpm });
});
