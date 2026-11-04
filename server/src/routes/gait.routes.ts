import { Router } from "express";
import { commandRegistry } from "../commands/CommandRegistry";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/authorization";
import type { CommandType } from "../packages/types";

export const gaitRouter = Router();
// Scoped to this router's own prefix — see audio.routes.ts for why an
// unscoped `.use(...)` would leak into every other router mounted on the
// same flat /api namespace.
gaitRouter.use("/gait", requireAuth, requireRole("TRUSTED")); // gait movement requires at least TRUSTED

const dispatch = (type: CommandType, body: unknown, isAdmin: boolean) =>
  commandRegistry.dispatch({ type, params: body, source: "DASHBOARD", robotId: "vision-001", isAdmin });

gaitRouter.post("/gait/forward", async (req: AuthedRequest, res) => res.json(await dispatch("WALK_FORWARD", req.body, req.user?.role === "ADMIN")));
gaitRouter.post("/gait/backward", async (req: AuthedRequest, res) => res.json(await dispatch("WALK_BACKWARD", req.body, req.user?.role === "ADMIN")));
gaitRouter.post("/gait/left", async (req: AuthedRequest, res) => res.json(await dispatch("TURN_LEFT", req.body, req.user?.role === "ADMIN")));
gaitRouter.post("/gait/right", async (req: AuthedRequest, res) => res.json(await dispatch("TURN_RIGHT", req.body, req.user?.role === "ADMIN")));
gaitRouter.post("/gait/stop", async (req: AuthedRequest, res) => res.json(await dispatch("WALK_STOP", {}, req.user?.role === "ADMIN")));
