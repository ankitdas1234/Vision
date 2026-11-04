import { Router } from "express";
import { z } from "zod";
import { controlMode } from "../control/ControlMode";
import { compilerSettings } from "../control/CompilerSettings";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/authorization";
import { validateBody } from "../middleware/validation";
import { audit } from "../auth/AuditService";
import type { AuthedRequest } from "../middleware/auth";

export const settingsRouter = Router();

// Single switch: MANUAL (a human may move the robot / run Vision Script)
// vs AUTONOMOUS (the default — the brain drives). See docs/control-mode.md.
settingsRouter.get("/system/control-mode", requireAuth, async (_req, res) => {
  res.json({ mode: await controlMode.mode(), manualModeEnabled: await controlMode.isManualModeEnabled() });
});

settingsRouter.post("/system/control-mode", requireAuth, requireAdmin, validateBody(z.object({ manualModeEnabled: z.boolean() })), async (req: AuthedRequest, res) => {
  const manualModeEnabled = await controlMode.setManualModeEnabled(req.body.manualModeEnabled);
  await audit("SYSTEM_SETTING_CHANGED", { userId: req.user?.id, metadata: { setting: "manual_mode_enabled", value: manualModeEnabled } });
  res.json({ mode: manualModeEnabled ? "MANUAL" : "AUTONOMOUS", manualModeEnabled });
});

// Admin-only kill switch for the Vision Script compiler/terminal — separate
// from Control Mode. See docs/vision-script.md and CompilerSettings.ts.
// Readable by any authenticated user (so the dashboard can grey out the
// terminal for non-admins too), writable by ADMIN only.
settingsRouter.get("/system/settings/compiler-enabled", requireAuth, async (_req, res) => {
  res.json({ enabled: await compilerSettings.isEnabled() });
});

settingsRouter.post("/system/settings/compiler-enabled", requireAuth, requireAdmin, validateBody(z.object({ enabled: z.boolean() })), async (req: AuthedRequest, res) => {
  const enabled = await compilerSettings.setEnabled(req.body.enabled);
  await audit("PRIVILEGED_COMMAND", { userId: req.user?.id, metadata: { setting: "compiler_enabled", value: enabled } });
  res.json({ enabled });
});
