import { Router } from "express";
import { mentalIntelligence } from "../mental/MentalIntelligence";
import { requireAuth } from "../middleware/auth";

export const mentalRouter = Router();
// Scoped to this router's own prefix — see audio.routes.ts for why an
// unscoped `.use(requireAuth)` would leak into every other router mounted
// on the same flat /api namespace.
mentalRouter.use("/mental", requireAuth);

mentalRouter.get("/mental/state", (_req, res) => res.json(mentalIntelligence.getState()));
mentalRouter.get("/mental/curiosity", (_req, res) => res.json({ curiosity: mentalIntelligence.getState().curiosity, idleMs: mentalIntelligence.getIdleMs() }));
mentalRouter.post("/mental/evaluate", (_req, res) => res.json(mentalIntelligence.getState()));
