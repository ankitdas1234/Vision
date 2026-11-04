import { Router } from "express";
import { commandRegistry } from "../commands/CommandRegistry";
import { commandsRepository } from "../repositories/commands.repository";
import { commandRateLimit } from "../middleware/rateLimit";
import type { AuthedRequest } from "../middleware/auth";
import type { CommandType } from "../packages/types";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/authorization";
import { isAdminPresent, activeAdminSignals } from "../people/AdminPresence";

export const commandsRouter = Router();
// Scoped to this router's own prefix — see audio.routes.ts for why an
// unscoped `.use(requireAuth)` would leak into every other router mounted
// on the same flat /api namespace.
commandsRouter.use("/commands", requireAuth);

commandsRouter.post("/commands", commandRateLimit, async (req: AuthedRequest, res) => {
  const { type, params } = req.body as { type: CommandType; params?: unknown };
  const result = await commandRegistry.dispatch({
    type, params, source: "DASHBOARD", robotId: req.body.robotId ?? "vision-001",
    isAdmin: req.user?.role === "ADMIN", userId: req.user?.id,
  });
  await commandsRepository.log({
    robotId: null, source: "DASHBOARD", commandType: type, command: params,
    status: result.status, executionResult: result.result, error: result.error, executedAt: new Date(),
  } as never).catch(() => undefined);
  res.status(result.success ? 200 : 400).json(result);
});

commandsRouter.post("/commands/validate", async (req, res) => {
  res.json({ acknowledged: true, note: "Use POST /api/commands for full validate+execute pipeline." });
});

commandsRouter.post("/commands/execute", commandRateLimit, async (req: AuthedRequest, res) => {
  const { type, params, robotId } = req.body as { type: CommandType; params?: unknown; robotId?: string };
  const result = await commandRegistry.dispatch({ type, params, source: "DASHBOARD", robotId: robotId ?? "vision-001", isAdmin: req.user?.role === "ADMIN" });
  res.status(result.success ? 200 : 400).json(result);
});

// EMERGENCY_STOP is admin-only (see ADMIN_ONLY_COMMANDS in
// packages/commands.ts) — by explicit request, "admin" here deliberately
// does NOT mean "logged in with an ADMIN role." A dashboard session can
// be left open, shared, or stolen with nobody actually there; `isAdmin`
// instead comes from live proof someone was recently confirmed as an
// admin by VOICE (speaking to the robot, voiceprint-matched) or FACE
// (camera recognition, fully confirmed) — see people/AdminPresence.ts.
// Any logged-in user can still reach this route (requireAuth above), but
// only one backed by a recent live confirmation will actually pass
// CommandValidator's ADMIN_ONLY_COMMANDS check.
commandsRouter.post("/commands/emergency-stop", async (req: AuthedRequest, res) => {
  const robotId = req.body?.robotId ?? "vision-001";
  const result = await commandRegistry.dispatch({
    type: "EMERGENCY_STOP", params: {}, source: "DASHBOARD", robotId,
    isAdmin: isAdminPresent(robotId), userId: req.user?.id,
  });
  res.json({ ...result, verifiedBy: activeAdminSignals(robotId) });
});

// Resuming after an emergency stop is an ADMIN-only judgment call — see
// ADMIN_ONLY_COMMANDS. requireRole gives a clean 403 before we even build
// the dispatch; CommandValidator enforces the same rule independently.
commandsRouter.post("/commands/emergency-clear", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason : "";
  const result = await commandRegistry.dispatch({
    type: "EMERGENCY_CLEAR", params: { reason }, source: "DASHBOARD", robotId: req.body?.robotId ?? "vision-001",
    isAdmin: true, userId: req.user?.id,
  });
  res.status(result.success ? 200 : 400).json(result);
});

commandsRouter.get("/commands", async (_req, res) => res.json(await commandsRepository.list()));
commandsRouter.get("/commands/:id", async (req, res) => {
  const all = await commandsRepository.list();
  const found = all.find((c) => c.id === req.params.id);
  if (!found) return res.status(404).json({ code: "NOT_FOUND", message: "Command not found" });
  res.json(found);
});
