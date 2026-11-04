import express, { Router, type Request, type Response } from "express";
import path from "node:path";
import fs from "node:fs";
import { env } from "../config/env";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/authorization";
import { simulatedRobot } from "../robot/SimulatedRobot";
import { handleConversationTurn } from "./conversation.routes";
import { ROBOT_HARDWARE } from "../config/robot";
import { simulationMode, isSimMode, SIM_MODES } from "../simulation/SimulationMode";
import { aiRouter } from "../ai/router";
import { handleVoiceChat } from "../simulation/voice/chat";
import { loadLLMConfig, isConfigured } from "../simulation/consciousness/llm";
import { think } from "../simulation/consciousness/cortex";
import { aiRateLimit } from "../middleware/rateLimit";
import { simulationProgram } from "../simulation/SimulationProgram";
import { compilePipeline } from "../simulation/pipeline";
import { compilerSettings } from "../control/CompilerSettings";
import { mindStateRepository } from "../repositories/mindState.repository";
import { logger } from "../logging/Logger";

/**
 * ROBOT_MODE=simulation front end.
 *
 *   GET  /simulation/              the 3D client (static, server/simulation) — mounted
 *                                  ONLY in simulation mode (see index.ts).
 *   GET  /api/simulation/stream    Server-Sent Events: the virtual robot's state
 *                                  (pose, head, legs, ultrasonic) ~20 Hz plus
 *                                  speech text for the browser to speak.
 *   GET  /api/simulation/state     one snapshot.
 *   POST /api/simulation/say       {text} -> the SAME conversation pipeline the
 *                                  real robot's microphone uses (intent, safety,
 *                                  admin rules, repetition, music...). The browser
 *                                  does speech-to-text itself; everything after
 *                                  that is the real brain.
 *
 *   GET/POST /api/simulation/mode   which view the simulator shows: "compiler" or
 *                                  "autonomous". UI-only, in memory, simulation-only
 *                                  (see simulation/SimulationMode.ts). Pushed to the
 *                                  stream as a `mode` event so the dashboard and the
 *                                  simulator page stay in sync.
 *   GET/PUT/DELETE /api/simulation/mind-state
 *                                  the Autonomous simulator's saved human-like state (relationships,
 *                                  personality, body clock) for the logged-in user, so it follows them
 *                                  across browsers. TRUSTED+, simulation only. 503 if the DB is down
 *                                  (the simulator then just keeps using this browser's storage).
 *   GET/POST /api/simulation/program
 *                                  the Compiler view's program. The dashboard's Compiler page
 *                                  POSTs a source (ADMIN, same kill switch as compiling); the
 *                                  server compiles it and the simulator plays the resulting IR.
 *                                  Pushed on the stream as a `program` event. The simulator has
 *                                  no editor of its own.
 *   GET  /api/simulation/consciousness/health
 *   POST /api/simulation/consciousness/think
 *                                  the Autonomous view's optional language cortex: an
 *                                  LLM that only PHRASES speech for what the simulated
 *                                  mind already decided. It never chooses actions.
 *
 * The live page is a pure renderer: nothing it shows is computed in the browser. The
 * Compiler and Autonomous views run entirely in the browser (their own virtual body);
 * none of this reaches the command pipeline or the real robot.
 */

/** Where the 3D client lives. Override with SIM_CLIENT_DIR if you move it. */
export const SIM_CLIENT_DIR = process.env.SIM_CLIENT_DIR ?? (() => {
  const inside = path.resolve(__dirname, "../../simulation");   // server/simulation (works when only server/ is deployed)
  const sibling = path.resolve(__dirname, "../../../simulation"); // repo-root/simulation (the old location)
  return fs.existsSync(path.join(inside, "index.html")) || !fs.existsSync(path.join(sibling, "index.html")) ? inside : sibling;
})();

/** Static hosting for the client. Public on purpose: it's just HTML/JS/a model —
 * every API it calls below requires a login. */
const staticFiles = express.static(SIM_CLIENT_DIR, { index: "index.html", maxAge: "1h" });

/**
 * The simulator pages need a looser Content-Security-Policy than the API's helmet default:
 * the Autonomous view loads face-api / TensorFlow.js / COCO-SSD from jsDelivr, fonts come from
 * Google Fonts, and the dashboard (a different origin in dev) embeds /simulation/ in an iframe.
 * Only this static mount gets the relaxed policy; every API route keeps helmet's.
 */
export function simulationCsp(frontendUrl = env.FRONTEND_URL): string {
  const cdn = "https://cdn.jsdelivr.net https://cdnjs.cloudflare.com";
  return [
    "default-src 'self'",
    `script-src 'self' ${cdn} 'wasm-unsafe-eval'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: data: https:",
    `connect-src 'self' ${cdn} https://storage.googleapis.com https://tfhub.dev https://www.kaggle.com`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    `frame-ancestors 'self' ${frontendUrl}`,
  ].join("; ");
}

export const simulationStatic = Router();
simulationStatic.use((_req, res, next) => {
  if (env.ROBOT_MODE !== "simulation") return res.status(404).type("text/plain").send("The simulator is off: the robot is in hardware mode.");
  res.removeHeader("X-Frame-Options");
  res.setHeader("Content-Security-Policy", simulationCsp());
  next();
});
simulationStatic.use(staticFiles);

export const simulationRouter = Router();

function requireSimulationMode(_req: Request, res: Response, next: () => void) {
  if (env.ROBOT_MODE !== "simulation") {
    return res.status(409).json({ code: "NOT_SIMULATION", message: "Server is in ROBOT_MODE=hardware — the simulator is disabled." });
  }
  next();
}

simulationRouter.use("/simulation", requireAuth, requireSimulationMode);

simulationRouter.get("/simulation/state", (_req, res) => {
  res.json(simulatedRobot.snapshot());
});

simulationRouter.get("/simulation/stream", (req: AuthedRequest, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // don't let nginx/Render buffer the stream
  });
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  // ?only=mode,program lets a view that doesn't draw the virtual robot skip the 20 Hz state feed.
  const only = typeof req.query.only === "string" ? new Set(req.query.only.split(",")) : null;
  const wants = (event: string) => !only || only.has(event);

  if (wants("state")) send("hello", simulatedRobot.snapshot());
  send("mode", { mode: simulationMode.get() });
  if (wants("program") && simulationProgram.get()) send("program", { ...simulationProgram.get(), replay: true });
  const onState = (snapshot: unknown) => send("state", snapshot);
  const onSpeech = (speech: unknown) => send("speech", speech);
  const onMode = (m: unknown) => send("mode", m);
  const onProgram = (p: unknown) => send("program", p);
  if (wants("state")) simulatedRobot.on("state", onState);
  if (wants("speech")) simulatedRobot.on("speech", onSpeech);
  simulationMode.on("mode", onMode);
  if (wants("program")) simulationProgram.on("program", onProgram);

  const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 15_000);
  req.on("close", () => {
    clearInterval(keepAlive);
    simulatedRobot.off("state", onState);
    simulatedRobot.off("speech", onSpeech);
    simulationMode.off("mode", onMode);
    simulationProgram.off("program", onProgram);
  });
});

// ---- which view the simulator shows (Compiler / Autonomous) -----------------------------
simulationRouter.get("/simulation/mode", (_req, res) => {
  res.json({ mode: simulationMode.get(), modes: SIM_MODES });
});

simulationRouter.post("/simulation/mode", requireRole("TRUSTED"), (req, res) => {
  const mode = req.body?.mode;
  if (!isSimMode(mode)) return res.status(400).json({ code: "BAD_MODE", message: `mode must be one of: ${SIM_MODES.join(", ")}` });
  res.json({ mode: simulationMode.set(mode), modes: SIM_MODES });
});

// ---- Compiler view: the program the dashboard compiled ----------------------------------------
simulationRouter.get("/simulation/program", (_req, res) => {
  res.json({ program: simulationProgram.get() });
});

simulationRouter.post("/simulation/program", requireRole("ADMIN"), async (req, res) => {
  if (!(await compilerSettings.isEnabled())) {
    return res.status(403).json({ code: "COMPILER_DISABLED", message: "The Vision Script compiler has been disabled by an admin." });
  }
  const source = typeof req.body?.source === "string" ? req.body.source : "";
  if (!source.trim() || source.length > 50_000) return res.status(400).json({ code: "BAD_SOURCE", message: "source must be 1-50000 characters" });
  // Compile with the real stages. A script that fails is kept too, so the view can show where it stopped.
  const pipeline = compilePipeline(source);
  const name = typeof req.body?.sourceName === "string" ? req.body.sourceName.slice(0, 80) : "script.vs";
  const program = simulationProgram.set(name, source, pipeline, req.body?.autoplay === true);
  const summary = { seq: program.seq, sourceName: name, ok: program.ok, count: program.instructions.length, stages: program.stages };
  res.status(program.ok ? 200 : 422).json(program.ok ? { program: summary } : { code: "COMPILE_FAILED", diagnostics: program.diagnostics, program: summary });
});

// ---- Autonomous view: optional language cortex --------------------------------------------
/** Uses the multi-model router (silent fallback between providers) unless SIM_LLM_PROVIDER forces one. */
const llmConfig = () => {
  if (!process.env.SIM_LLM_PROVIDER && aiRouter.enabled) {
    return { ...loadLLMConfig(env, { ...process.env, SIM_LLM_PROVIDER: "router" }), vision: aiRouter.visionEnabled, model: aiRouter.status().routes.text[0] ?? "router" };
  }
  return loadLLMConfig(env);
};

const MAX_MIND_STATE_BYTES = 200_000;
simulationRouter.get("/simulation/mind-state", requireRole("TRUSTED"), async (req: AuthedRequest, res) => {
  try {
    const row = await mindStateRepository.get(req.user!.id);
    res.json(row ? { state: row.state, updatedAt: row.updatedAt } : { state: null });
  } catch (err) {
    logger.warn("mind-state read failed", { error: (err as Error).message });
    res.status(503).json({ code: "DB_UNAVAILABLE", message: "Saved state is unavailable right now" });
  }
});
simulationRouter.put("/simulation/mind-state", requireRole("TRUSTED"), async (req: AuthedRequest, res) => {
  const state = req.body?.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) return res.status(400).json({ code: "INVALID_STATE", message: "state must be an object" });
  if (JSON.stringify(state).length > MAX_MIND_STATE_BYTES) return res.status(413).json({ code: "STATE_TOO_LARGE", message: "state is too large" });
  try {
    const row = await mindStateRepository.put(req.user!.id, state);
    res.json({ ok: true, updatedAt: row?.updatedAt });
  } catch (err) {
    logger.warn("mind-state write failed", { error: (err as Error).message });
    res.status(503).json({ code: "DB_UNAVAILABLE", message: "Could not save right now" });
  }
});
simulationRouter.delete("/simulation/mind-state", requireRole("TRUSTED"), async (req: AuthedRequest, res) => {
  try { await mindStateRepository.delete(req.user!.id); res.json({ ok: true }); }
  catch (err) { logger.warn("mind-state delete failed", { error: (err as Error).message }); res.status(503).json({ code: "DB_UNAVAILABLE" }); }
});

simulationRouter.get("/simulation/consciousness/health", (_req, res) => {
  const cfg = llmConfig();
  res.json({ llm: { configured: isConfigured(cfg), provider: cfg.provider, model: cfg.model, vision: cfg.vision } });
});

simulationRouter.post("/simulation/consciousness/think", requireRole("TRUSTED"), aiRateLimit, async (req, res) => {
  const cfg = llmConfig();
  if (!isConfigured(cfg)) return res.status(503).json({ error: "no LLM configured — the local mind still works" });
  const body = req.body ?? {};
  const frame = typeof body.frame === "string" && body.frame.length < 400_000 ? body.frame : null;
  try {
    const decision = await think(cfg, body.request, frame);
    res.json({ decision });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "language cortex failed" });
  }
});

/** Voice view status: is an AI configured (open questions) and is music available. Commands work without either. */
simulationRouter.get("/simulation/voice/health", (_req, res) => {
  const st = aiRouter.status();
  res.json({ ai: { configured: st.enabled, models: st.routes.text }, music: { configured: !!process.env.JAMENDO_CLIENT_ID } });
});

/**
 * One turn for the Voice view. Wake-word commands ("Vision, dance", "turn left") never call an AI; "play <song>"
 * uses the licensed Jamendo catalogue; open questions go to the multi-model AI router. Simulation only.
 */
simulationRouter.post("/simulation/voice/chat", requireRole("TRUSTED"), aiRateLimit, async (req, res) => {
  res.json(await handleVoiceChat(req.body?.message, req.body?.history));
});

simulationRouter.post("/simulation/say", requireRole("TRUSTED"), async (req: AuthedRequest, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text || text.length > 500) return res.status(400).json({ code: "BAD_TEXT", message: "text must be 1-500 characters" });

  // A logged-in ADMIN speaking to the simulator is treated as an identified admin
  // (their login is the verification the robot would otherwise get from voice/face).
  // The conversation pipeline still requires them to address "Vision" directly
  // before any admin-only action is honored.
  const fakeReq = {
    body: {
      robotCode: ROBOT_HARDWARE.robotCode,
      segments: [{ transcript: text, isAdmin: req.user?.role === "ADMIN", speakerTag: `web_${req.user?.id ?? "user"}` }],
    },
  } as Request;
  return handleConversationTurn(fakeReq, res);
});
