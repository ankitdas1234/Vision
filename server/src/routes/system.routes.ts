import { Router } from "express";
import { aiRouter } from "../ai/router";
import { robotManager } from "../robot/RobotManager";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/authorization";
import { env } from "../config/env";
import { simulatedRobot } from "../robot/SimulatedRobot";
import { getRobotLinkStatus } from "../robot/linkStatus";
import { robotModeService, isRobotMode } from "../robot/RobotModeService";
import { systemHealthService } from "../system/SystemHealthService";

export const systemRouter = Router();

// Public, lightweight — for load balancer / uptime pings. Kept fast and
// unauthenticated on purpose (Render's healthCheckPath hits this).
systemRouter.get("/system/health", (_req, res) => res.json({ status: "OK" }));

// Authenticated, full sweep — every subsystem actually exercised (DB round
// trip, robot link, servos, ultrasonic, camera, audio, control mode,
// compiler self-test, AI fallback, Google Drive). Powers the dashboard's
// Monitoring page.
systemRouter.get("/system/health/full", requireAuth, async (_req, res) => {
  const report = await systemHealthService.run();
  res.json(report);
});

/** Which AI models are configured, in fallback order, and which are cooling down. No keys are exposed. */
systemRouter.get("/system/ai-status", requireAuth, (_req, res) => res.json(aiRouter.status()));

systemRouter.get("/system/capabilities", requireAuth, (_req, res) => res.json(robotManager.getStatus().capabilities));

// ---- ROBOT_MODE visibility + simulator controls --------------------------------
// GET: which end of the pipeline the brain is wired to, and (in simulation) the
// virtual robot's body state. POST ultrasonic: drop an obstacle in front of the
// virtual sensor to exercise the safety stop. Both only exist meaningfully in
// simulation; in hardware mode the POST is refused.
systemRouter.get("/system/robot-mode", requireAuth, (_req, res) => {
  res.json({
    mode: env.ROBOT_MODE,
    simulator: env.ROBOT_MODE === "simulation" ? { running: simulatedRobot.isRunning(), state: simulatedRobot.state } : null,
  });
});

// The robot connection at a glance: which mode (simulation/hardware), which transport is live
// (simulator / WebSocket / HTTP fallback / none), heartbeat age, and what the body is doing.
// Powers the dashboard's top bar, home page and Monitoring page (polled every 2 s).
systemRouter.get("/system/robot-link", requireAuth, (_req, res) => {
  res.json(getRobotLinkStatus());
});

// What THIS server thinks of the caller. Lets the dashboard (and you) see at once whether the running server is the
// latest version and which role it applies — the role is read from the database on every request.
export const SERVER_BUILD = "role-from-db-1";
systemRouter.get("/system/whoami", requireAuth, (req, res) => {
  const user = (req as AuthedRequest).user;
  res.json({ id: user?.id ?? null, email: user?.email ?? null, role: user?.role ?? null, build: SERVER_BUILD });
});

// Switch the robot between the virtual robot and the real one. Dashboard-controlled; admin only.
// Going to "hardware" is refused unless the caller says confirmHardware: true (the dashboard asks first).
systemRouter.post("/system/robot-mode", requireAuth, requireRole("ADMIN"), (req, res) => {
  const mode = req.body?.mode;
  if (!isRobotMode(mode)) return res.status(400).json({ error: 'mode must be "simulation" or "hardware"' });
  if (mode === "hardware" && env.ROBOT_MODE !== "hardware" && req.body?.confirmHardware !== true) {
    return res.status(400).json({ code: "CONFIRM_REQUIRED", error: "Switching to the real robot needs confirmHardware: true" });
  }
  robotModeService.set(mode);
  res.json({ mode: env.ROBOT_MODE, link: getRobotLinkStatus() });
});

systemRouter.post("/system/simulation/ultrasonic", requireAuth, requireRole("ADMIN"), (req, res) => {
  if (env.ROBOT_MODE !== "simulation") return res.status(409).json({ error: "Only available when ROBOT_MODE=simulation" });
  const mm = Number(req.body?.distanceMm);
  if (!Number.isFinite(mm) || mm < 0) return res.status(400).json({ error: "distanceMm must be a number >= 0" });
  simulatedRobot.setUltrasonicMm(mm);
  res.json({ ultrasonicMm: simulatedRobot.state.ultrasonicMm });
});
