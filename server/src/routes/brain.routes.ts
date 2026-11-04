import { Router } from "express";
import { brainOrchestrator } from "../brain/BrainOrchestrator";
import { requireAuth } from "../middleware/auth";

export const brainRouter = Router();
// Scoped to this router's own prefix — see audio.routes.ts for why an
// unscoped `.use(requireAuth)` would leak into every other router mounted
// on the same flat /api namespace.
brainRouter.use("/brain", requireAuth);

brainRouter.post("/brain/observe", async (req, res) => {
  const buffer = Buffer.from(req.body?.imageBase64 ?? "", "base64");
  const result = await brainOrchestrator.observeAndReact(buffer, req.body?.robotId ?? "vision-001");
  res.json(result);
});

brainRouter.post("/brain/process", async (req, res) => {
  res.json({ observationId: req.body?.observationId, processed: true });
});
