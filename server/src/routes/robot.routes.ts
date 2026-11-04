import { env } from "../config/env";
import { Router } from "express";
import { robotManager } from "../robot/RobotManager";
import { robotConnection } from "../robot/RobotConnection";
import { robotRepository } from "../repositories/robot.repository";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/authorization";

export const robotRouter = Router();
// Scoped to this router's own prefix — see audio.routes.ts for why an
// unscoped `.use(requireAuth)` would leak into every other router mounted
// on the same flat /api namespace.
robotRouter.use("/robot", requireAuth);

robotRouter.get("/robot", (_req, res) => res.json(robotManager.getStatus()));
robotRouter.get("/robot/status", (_req, res) => res.json(robotManager.getStatus()));

// Marks the robot connection as intentionally (re)established / torn down from the
// dashboard's perspective — actual liveness still comes from heartbeat telemetry.
robotRouter.post("/robot/connect", requireRole("ADMIN"), (_req, res) => {
  // In hardware mode the connection is whatever the ESP32 really established; letting an admin mark it
  // "connected" would make the dashboard (and the offline safety gate) lie about a robot that isn't there.
  if (env.ROBOT_MODE === "hardware") return res.status(409).json({ code: "HARDWARE_MODE", message: "In ROBOT_MODE=hardware the robot connects by itself; it cannot be marked connected from here." });
  robotConnection.markHeartbeat(true);
  res.json(robotManager.getStatus());
});
robotRouter.post("/robot/disconnect", requireRole("ADMIN"), (_req, res) => res.json({ acknowledged: true }));

// There's no GPS on this hardware — the admin tells the robot what room/
// place it's currently in, and every person encounter logged from here on
// is tagged with it. See people/PersonEncounterService.ts.
robotRouter.patch("/robot/location", requireRole("ADMIN"), async (req, res) => {
  const status = robotManager.getStatus();
  const robot = await robotRepository.findByCode(status.robotCode);
  if (!robot) return res.status(404).json({ code: "NOT_FOUND", message: "Robot not registered yet — no heartbeat received" });
  const location = typeof req.body?.location === "string" ? req.body.location : null;
  if (!location) return res.status(400).json({ code: "INVALID_REQUEST", message: "location is required" });
  const row = await robotRepository.setLocation(robot.id, location);
  res.json(row);
});
