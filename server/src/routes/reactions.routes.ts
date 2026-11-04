import { Router } from "express";
import { reactionsRepository } from "../repositories/reactions.repository";
import { commandRegistry } from "../commands/CommandRegistry";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/authorization";

export const reactionsRouter = Router();
// Scoped to this router's own prefix — see audio.routes.ts for why an
// unscoped `.use(requireAuth)` would leak into every other router mounted
// on the same flat /api namespace.
reactionsRouter.use("/reactions", requireAuth);

reactionsRouter.get("/reactions", async (_req, res) => res.json(await reactionsRepository.recent().catch(() => [])));

reactionsRouter.post("/reactions/execute", requireRole("TRUSTED"), async (req: AuthedRequest, res) => {
  // A dashboard-triggered manual reaction still goes through the same Command Registry.
  const { type, params } = req.body as { type: any; params?: unknown };
  res.json(await commandRegistry.dispatch({ type, params, source: "DASHBOARD", robotId: "vision-001", isAdmin: req.user?.role === "ADMIN" }));
});

reactionsRouter.post("/reactions/cancel", requireRole("TRUSTED"), async (_req, res) => res.json({ cancelled: true }));
