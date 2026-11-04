import { Router } from "express";
import { cameraService } from "../camera/CameraService";
import { visionStats } from "../camera/visionStats";
import { visionFrameEventsRepository } from "../repositories/visionFrameEvents.repository";
import { getAttentionControllerFor } from "../attention/AttentionController";
import { commandRegistry } from "../commands/CommandRegistry";
import { requireAuth, type AuthedRequest } from "../middleware/auth";

export const cameraRouter = Router();
// Scoped to this router's own prefix — see audio.routes.ts for why an
// unscoped `.use(requireAuth)` would leak into every other router mounted
// on the same flat /api namespace.
cameraRouter.use("/camera", requireAuth);

cameraRouter.post("/camera/capture", async (req, res) => {
  const buffer = Buffer.from(req.body?.imageBase64 ?? "", "base64");
  const result = await cameraService.capture(buffer, req.body?.robotId ?? "vision-001");
  res.json(result);
});

// Operational visibility into how many captures are actually useful — see
// docs/vision-pipeline.md. Not per-robot yet; counters are process-wide.
cameraRouter.get("/camera/stats", (_req, res) => {
  res.json({ ...visionStats.snapshot(), usefulFrameRate: visionStats.usefulFrameRate() });
});

// Durable counterpart to /camera/stats — survives restarts, can be scoped
// to a robot, backed by vision_frame_events (see database/schema.ts).
cameraRouter.get("/camera/frame-events", async (req, res) => {
  const robotId = typeof req.query.robotId === "string" ? req.query.robotId : undefined;
  const summary = await visionFrameEventsRepository.summary(robotId);
  res.json({ summary });
});

// Firmware polls this to decide how soon to capture again — the concrete
// hook for "server-driven adaptive capture scheduling" described in
// docs/vision-pipeline.md. A snapshot only; it does not itself run a loop.
cameraRouter.get("/camera/schedule", (req, res) => {
  const robotId = typeof req.query.robotId === "string" ? req.query.robotId : "vision-001";
  const controller = getAttentionControllerFor(robotId);
  const snapshot = controller.snapshot();
  // One-shot: consuming clears it, so a dashboard "capture now" click
  // reaches firmware on its very next poll and then stops forcing captures.
  const forceCaptureNow = controller.consumeForceCaptureRequest();
  res.json({ ...snapshot, forceCaptureNow });
});

cameraRouter.post("/camera/tracking/start", async (req: AuthedRequest, res) => res.json(await commandRegistry.dispatch({ type: "CAMERA_START_TRACKING", params: {}, source: "DASHBOARD", robotId: "vision-001", isAdmin: req.user?.role === "ADMIN" })));
cameraRouter.post("/camera/tracking/stop", async (req: AuthedRequest, res) => res.json(await commandRegistry.dispatch({ type: "CAMERA_STOP_TRACKING", params: {}, source: "DASHBOARD", robotId: "vision-001", isAdmin: req.user?.role === "ADMIN" })));
