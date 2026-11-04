import { Router } from "express";
import { scriptService } from "../scripts/ScriptService";
import { controlMode } from "../control/ControlMode";
import { compilerSettings } from "../control/CompilerSettings";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/authorization";
import type { AuthedRequest } from "../middleware/auth";

export const scriptsRouter = Router();
// Scoped to this router's own prefix — see audio.routes.ts for why an
// unscoped `.use(requireAuth)` would leak into every other router mounted
// on the same flat /api namespace.
//
// ADMIN-only, full stop — compiling still only builds an AST/IR and never
// touches hardware, but Vision Script is a direct hardware-control surface
// (it's how EYE_SET/WALK_FORWARD/DANCE/etc. get dispatched by hand) and
// isn't something a regular household TRUSTED user should be able to see
// or poke at, let alone run. The dashboard hides the Compiler page/nav
// entirely for non-admins (see dashboard/src/App.jsx RoleRoute) — this
// server-side check is the enforcement that actually matters; the
// dashboard guard is just UX.
scriptsRouter.use("/scripts", requireAuth, requireRole("ADMIN"));

const COMPILER_DISABLED_RESPONSE = {
  code: "COMPILER_DISABLED",
  message: "The Vision Script compiler has been disabled by an admin. It must be re-enabled from the Compiler page before any script can be compiled or run.",
};

// Compiling (dry-run: source -> AST -> IR, no hardware touched) is always
// allowed with respect to Control Mode, even in autonomous mode — useful for
// preparing a script ahead of switching to Manual Mode. It IS, however,
// subject to the separate admin kill switch below: when an admin disables
// the compiler, compiling is blocked too, not just execution — the kill
// switch is a "this feature is off" statement, not a hardware gate.
scriptsRouter.post("/scripts/compile", async (req, res) => {
  if (!(await compilerSettings.isEnabled())) return res.status(403).json(COMPILER_DISABLED_RESPONSE);
  res.json(scriptService.compile(req.body?.source ?? ""));
});

scriptsRouter.post("/scripts/execute", async (req: AuthedRequest, res) => {
  if (!(await compilerSettings.isEnabled())) return res.status(403).json(COMPILER_DISABLED_RESPONSE);

  if (!(await controlMode.isManualModeEnabled())) {
    return res.status(403).json({
      code: "AUTONOMOUS_MODE_ACTIVE",
      message: "Vision is in AUTONOMOUS mode — enable Manual Mode to execute a script that controls hardware.",
    });
  }
  const result = await scriptService.compileAndExecute(req.body?.source ?? "", req.body?.robotId ?? "vision-001", req.user?.role === "ADMIN");
  res.json(result);
});
