import { Router } from "express";
import { audioService } from "../audio/AudioService";
import { commandRegistry } from "../commands/CommandRegistry";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/authorization";

export const audioRouter = Router();
// Scoped to "/audio" — NOT a bare `.use(requireAuth)`. Every router in this
// app is mounted flat on /api (see index.ts), so an unscoped `.use(fn)` here
// would run for EVERY request under /api/*, not just this router's own
// routes — including robot-authed or public routes defined in OTHER router
// files, silently rejecting them with "Login required" before they ever
// reach their real handler. Scoping by path prefix is what makes this
// middleware only apply to paths this router actually owns.
audioRouter.use("/audio", requireAuth);

audioRouter.post("/audio/listen/start", requireRole("TRUSTED"), async (req: AuthedRequest, res) => {
  res.json(await commandRegistry.dispatch({ type: "AUDIO_START_LISTENING", params: {}, source: "DASHBOARD", robotId: "vision-001", isAdmin: req.user?.role === "ADMIN" }));
});
audioRouter.post("/audio/listen/stop", requireRole("TRUSTED"), async (req: AuthedRequest, res) => {
  res.json(await commandRegistry.dispatch({ type: "AUDIO_STOP_LISTENING", params: {}, source: "DASHBOARD", robotId: "vision-001", isAdmin: req.user?.role === "ADMIN" }));
});
audioRouter.post("/audio/speak", requireRole("TRUSTED"), async (req: AuthedRequest, res) => {
  res.json(await commandRegistry.dispatch({ type: "AUDIO_SPEAK", params: { text: req.body?.text }, source: "DASHBOARD", robotId: "vision-001", isAdmin: req.user?.role === "ADMIN" }));
});
audioRouter.post("/audio/stop", requireRole("TRUSTED"), async (req: AuthedRequest, res) => {
  res.json(await commandRegistry.dispatch({ type: "AUDIO_STOP", params: {}, source: "DASHBOARD", robotId: "vision-001", isAdmin: req.user?.role === "ADMIN" }));
});

audioRouter.get("/audio/state", (_req, res) => res.json({ state: audioService.getState() }));
