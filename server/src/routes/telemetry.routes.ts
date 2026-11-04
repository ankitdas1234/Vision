import { Router } from "express";
import { telemetryService } from "../telemetry/TelemetryService";
import { ingestHeartbeat } from "../robot/heartbeat";
import { requireAuth, requireRobotAuth } from "../middleware/auth";

export const telemetryRouter = Router();

telemetryRouter.get("/telemetry", requireAuth, (_req, res) => res.json(telemetryService.all()));
telemetryRouter.post("/heartbeat", requireRobotAuth, async (req, res) => {
  ingestHeartbeat(req.body, req.ip ?? null);
  res.json({ acknowledged: true, serverTime: new Date().toISOString() });
});
