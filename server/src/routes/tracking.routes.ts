import { Router } from "express";
import { DEFAULT_TRACKING_CONFIG } from "../perception/tracking";
import { requireAuth } from "../middleware/auth";

export const trackingRouter = Router();
// Scoped to this router's own prefix — see audio.routes.ts for why an
// unscoped `.use(requireAuth)` would leak into every other router mounted
// on the same flat /api namespace.
trackingRouter.use("/tracking", requireAuth);
trackingRouter.get("/tracking/config", (_req, res) => res.json(DEFAULT_TRACKING_CONFIG));
