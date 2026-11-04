import { Router } from "express";
import { pendingCommandQueue } from "../commands/PendingCommandQueue";
import { takePendingSpeech } from "../audio/PendingSpeechCache";
import { requireRobotAuth } from "../middleware/auth";

/**
 * Owns the exact paths `/commands/pending` and `/audio/pending-speech`
 * under robot auth — mounted before `commandsRouter`/`audioRouter` (which
 * otherwise blanket-guard those prefixes with user-session `requireAuth`)
 * for the same reason `conversationRouter` is mounted before
 * `audioRouter` in index.ts: an exact robot-authed route has to be
 * matched before a broader user-authed prefix guard ever sees the
 * request.
 */
export const commandDeliveryRouter = Router();

// Firmware's CaptureScheduler-style poll loop calls this on the same
// cadence as the capture schedule (COMMAND_POLL_INTERVAL_MS) — see
// commands/PendingCommandQueue.ts for why this exists at all (nothing
// dispatched via CommandRegistry ever reached physical hardware before).
commandDeliveryRouter.get("/commands/pending", requireRobotAuth, (req, res) => {
  const robotId = typeof req.query.robotId === "string" ? req.query.robotId : "vision-001";
  res.json({ commands: pendingCommandQueue.drain(robotId) });
});

// Fetched by protocol/CommandPoller.cpp right after it sees an AUDIO_SPEAK
// command come through the queue above — see audio/PendingSpeechCache.ts
// for why the actual audio bytes need a separate endpoint (the command
// queue entry itself only carries the text, not the synthesized audio).
commandDeliveryRouter.get("/audio/pending-speech", requireRobotAuth, (req, res) => {
  const robotId = typeof req.query.robotId === "string" ? req.query.robotId : "vision-001";
  const speech = takePendingSpeech(robotId);
  res.json(speech ? { available: true, ...speech } : { available: false });
});
