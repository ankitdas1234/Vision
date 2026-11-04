import { Router } from "express";
import { taskManager } from "../tasks/TaskManager";
import { requireAuth } from "../middleware/auth";

export const tasksRouter = Router();
// Scoped to this router's own prefix — see audio.routes.ts for why an
// unscoped `.use(requireAuth)` would leak into every other router mounted
// on the same flat /api namespace.
tasksRouter.use("/tasks", requireAuth);
tasksRouter.get("/tasks", (_req, res) => res.json(taskManager.list()));
tasksRouter.post("/tasks", (req, res) => res.json(taskManager.create(req.body)));
tasksRouter.post("/tasks/:id/cancel", (req, res) => res.json(taskManager.cancel(req.params.id)));
