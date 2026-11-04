import { Router } from "express";
import { objectsRepository } from "../repositories/objects.repository";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/authorization";

export const objectsRouter = Router();
// Scoped to this router's own prefix — see audio.routes.ts for why an
// unscoped `.use(requireAuth)` would leak into every other router mounted
// on the same flat /api namespace.
// ADMIN only: object profiles include photos and the full observation history.
objectsRouter.use("/objects", requireAuth, requireRole("ADMIN"));
objectsRouter.get("/objects", async (_req, res) => res.json(await objectsRepository.list()));

// Full profile for one recognized object: its structured features, the
// photographed history of every time it was actually observed, and the
// conceptual-memory entries recording how confident Vision was each
// time it identified it — the "with image and everything, and how the
// data was collected" view for the dashboard's Objects page.
objectsRouter.get("/objects/:id", async (req, res) => {
  const object = await objectsRepository.findById(req.params.id);
  if (!object) return res.status(404).json({ code: "NOT_FOUND", message: "Object not found" });

  const [features, observations, conceptualMemories] = await Promise.all([
    objectsRepository.featuresFor(object.id),
    objectsRepository.observationsFor(object.id),
    objectsRepository.conceptualMemoriesFor(object.id),
  ]);

  res.json({
    ...object,
    // First observation with a stored photo, newest first — a quick
    // "here's what it looks like" without the frontend having to scan
    // the whole observation list itself.
    photoUrl: observations.find((o) => o.photoUrl)?.photoUrl ?? null,
    features,
    observations,
    conceptualMemories,
  });
});
