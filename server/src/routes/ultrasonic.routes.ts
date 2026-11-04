import { Router } from "express";
import { ultrasonicController } from "../ultrasonic/UltrasonicController";
import { commandRegistry } from "../commands/CommandRegistry";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/authorization";

export const ultrasonicRouter = Router();
// Scoped to this router's own prefix — see audio.routes.ts for why an
// unscoped `.use(requireAuth)` would leak into every other router mounted
// on the same flat /api namespace.
ultrasonicRouter.use("/ultrasonic", requireAuth);

ultrasonicRouter.get("/ultrasonic", (_req, res) => res.json(ultrasonicController.read()));
ultrasonicRouter.get("/ultrasonic/status", (_req, res) => res.json({ status: ultrasonicController.status(), movementSafe: ultrasonicController.isMovementSafe() }));

ultrasonicRouter.post("/ultrasonic/calibrate", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  res.json(await commandRegistry.dispatch({ type: "ULTRASONIC_CALIBRATE", params: req.body, source: "DASHBOARD", robotId: "vision-001", isAdmin: req.user?.role === "ADMIN" }));
});
ultrasonicRouter.post("/ultrasonic/enable", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  res.json(await commandRegistry.dispatch({ type: "ULTRASONIC_ENABLE", params: {}, source: "DASHBOARD", robotId: "vision-001", isAdmin: req.user?.role === "ADMIN" }));
});
ultrasonicRouter.post("/ultrasonic/disable", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  res.json(await commandRegistry.dispatch({ type: "ULTRASONIC_DISABLE", params: {}, source: "DASHBOARD", robotId: "vision-001", isAdmin: req.user?.role === "ADMIN" }));
});
