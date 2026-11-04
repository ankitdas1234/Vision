import { Router } from "express";
import { decisionsRepository } from "../repositories/decisions.repository";
import { requireAuth } from "../middleware/auth";

export const decisionsRouter = Router();
// Scoped to this router's own prefix — see audio.routes.ts for why an
// unscoped `.use(requireAuth)` would leak into every other router mounted
// on the same flat /api namespace.
decisionsRouter.use("/decisions", requireAuth);

decisionsRouter.get("/decisions", async (_req, res) => res.json(await decisionsRepository.recent().catch(() => [])));
decisionsRouter.post("/decisions/evaluate", async (_req, res) => res.json({ note: "Use POST /api/brain/observe for a full perception-to-decision cycle." }));
