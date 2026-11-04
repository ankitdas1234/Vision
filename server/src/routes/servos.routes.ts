import { HEAD_CHANNEL, LEG_CHANNELS } from "../servos/ServoConfiguration";
import { Router } from "express";
import { servoManager } from "../servos/ServoManager";
import { commandRegistry } from "../commands/CommandRegistry";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/authorization";
import type { CommandType } from "../packages/types";

export const servosRouter = Router();
// Scoped to this router's own prefix — see audio.routes.ts for why an
// unscoped `.use(requireAuth)` would leak into every other router mounted
// on the same flat /api namespace.
servosRouter.use("/servos", requireAuth);

servosRouter.get("/servos", (_req, res) => res.json(servoManager.snapshot()));
servosRouter.get("/servos/:channel", (req, res) => {
  const ch = Number(req.params.channel);
  try {
    const snap = servoManager.snapshot();
    const positional = snap.positional.find((s) => s.channel === ch);
    const continuous = snap.continuous.find((s) => s.channel === ch);
    res.json(positional ?? continuous ?? { error: "not found" });
  } catch (e) {
    res.status(404).json({ code: "NOT_FOUND", message: (e as Error).message });
  }
});

// Head routes (CH0) — registered BEFORE /servos/:channel/* below, since Express
// matches routes in order and :channel would otherwise swallow
// "/servos/eye/move" (Number("eye") is NaN). The head has its own path because
// it is positional (angle 0-180) while the legs, handled by the generic
// /servos/:channel/* routes below, are continuous (signed speed).
servosRouter.post("/servos/eye/move", requireRole("TRUSTED"), async (req: AuthedRequest, res) => {
  res.json(await commandRegistry.dispatch({ type: "EYE_SET", params: req.body, source: "DASHBOARD", robotId: "vision-001", isAdmin: req.user?.role === "ADMIN" }));
});

servosRouter.post("/servos/eye/center", requireRole("TRUSTED"), async (req: AuthedRequest, res) => {
  res.json(await commandRegistry.dispatch({ type: "EYE_CENTER", params: {}, source: "DASHBOARD", robotId: "vision-001", isAdmin: req.user?.role === "ADMIN" }));
});

// Movement requires at least TRUSTED — plain USER accounts are view-only.
//
// Channels: 0 = head (use /servos/eye/*), 1 = left leg, 2 = right leg.
servosRouter.post("/servos/:channel/move", requireRole("TRUSTED"), async (req: AuthedRequest, res) => {
  const ch = Number(req.params.channel);
  if (ch !== LEG_CHANNELS.left && ch !== LEG_CHANNELS.right) {
    return res.status(400).json({ error: "Channel 1 (left leg) and 2 (right leg) only — use /servos/eye/move for the head (channel 0)" });
  }
  const type: CommandType = ch === LEG_CHANNELS.left ? "LEFT_LEG_ROTATE" : "RIGHT_LEG_ROTATE";
  const result = await commandRegistry.dispatch({ type, params: req.body, source: "DASHBOARD", robotId: "vision-001", isAdmin: req.user?.role === "ADMIN" });
  res.json(result);
});

servosRouter.post("/servos/:channel/stop", requireRole("TRUSTED"), async (req: AuthedRequest, res) => {
  const ch = Number(req.params.channel);
  if (ch !== LEG_CHANNELS.left && ch !== LEG_CHANNELS.right) {
    return res.status(400).json({ error: "Channel 1 (left leg) or 2 (right leg) only — the head (channel 0) is positional: use /servos/0/center or /servos/eye/move" });
  }
  const type: CommandType = ch === LEG_CHANNELS.left ? "LEFT_LEG_STOP" : "RIGHT_LEG_STOP";
  res.json(await commandRegistry.dispatch({ type, params: {}, source: "DASHBOARD", robotId: "vision-001", isAdmin: req.user?.role === "ADMIN" }));
});

// Only the head (channel 0) has a centre position — legs are continuous-rotation.
servosRouter.post("/servos/:channel/center", requireRole("TRUSTED"), async (req: AuthedRequest, res) => {
  if (Number(req.params.channel) !== HEAD_CHANNEL) return res.status(400).json({ error: "Only the head (channel 0) can be centred" });
  res.json(await commandRegistry.dispatch({ type: "EYE_CENTER", params: {}, source: "DASHBOARD", robotId: "vision-001", isAdmin: req.user?.role === "ADMIN" }));
});

// SERVOS_SAFE is ADMIN-only at the CommandValidator level too — requireRole here gives a clean 403 earlier.
servosRouter.post("/servos/safe", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  res.json(await commandRegistry.dispatch({ type: "SERVOS_SAFE", params: {}, source: "DASHBOARD", robotId: "vision-001", isAdmin: req.user?.role === "ADMIN" }));
});
