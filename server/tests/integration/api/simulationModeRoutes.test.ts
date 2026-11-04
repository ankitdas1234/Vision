import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sim-mode-"));
writeFileSync(join(dir, "index.html"), "<html>shell</html>");
mkdirSync(join(dir, "compiler"));
writeFileSync(join(dir, "compiler", "index.html"), "<html>compiler view</html>");
process.env.SIM_CLIENT_DIR = dir;

let role = "TRUSTED";
vi.mock("../../../src/middleware/auth", () => ({
  requireAuth: (req: any, res: any, next: any) => (req.headers["x-test-anon"] ? res.status(401).json({ code: "UNAUTHENTICATED" }) : ((req.user = { id: "u1", role }), next())),
  requireRobotAuth: (_r: any, _s: any, n: any) => n(),
  SESSION_COOKIE_NAME: "s",
}));
vi.mock("../../../src/middleware/authorization", () => ({
  requireRole: (min: string) => (req: any, res: any, next: any) => {
    const rank: Record<string, number> = { USER: 0, TRUSTED: 1, ADMIN: 2 };
    return rank[req.user?.role ?? "USER"] >= rank[min] ? next() : res.status(403).json({ code: "FORBIDDEN" });
  },
}));
vi.mock("../../../src/middleware/rateLimit", () => ({ aiRateLimit: (_q: any, _s: any, n: any) => n() }));
let compilerOn = true;
vi.mock("../../../src/control/CompilerSettings", () => ({ compilerSettings: { isEnabled: async () => compilerOn } }));
vi.mock("../../../src/scripts/ScriptService", async () => {
  const { Compiler } = await import("../../../src/compiler/Compiler");
  return { scriptService: { compile: (src: string) => new Compiler().compile(src) } };
});
vi.mock("../../../src/routes/conversation.routes", () => ({ handleConversationTurn: async (_q: any, res: any) => res.json({}) }));
vi.mock("../../../src/camera/CameraService", () => ({ cameraService: { capture: async () => ({}) } }));
vi.mock("../../../src/robot/heartbeat", () => ({ ingestHeartbeat: () => undefined }));
vi.mock("../../../src/config/env", async (orig) => {
  const actual = await orig<typeof import("../../../src/config/env")>();
  return { env: { ...actual.env, ROBOT_MODE: "simulation" as "simulation" | "hardware", OPENROUTER_API_KEY: undefined, FRONTEND_URL: "http://localhost:5173" } };
});

const { simulationRouter, simulationStatic, simulationCsp } = await import("../../../src/routes/simulation.routes");
const { simulationMode } = await import("../../../src/simulation/SimulationMode");
const { simulationProgram } = await import("../../../src/simulation/SimulationProgram");
const { simulatedRobot } = await import("../../../src/robot/SimulatedRobot");
const { env } = await import("../../../src/config/env");

let server: Server; let base: string;
beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use("/api", simulationRouter);
  app.use("/simulation", simulationStatic);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => { simulatedRobot.stop(); server.close(); });
beforeEach(() => { simulationMode.reset(); simulationProgram.reset(); compilerOn = true; role = "TRUSTED"; (env as any).ROBOT_MODE = "simulation"; });

const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("simulation view mode (Compiler / Autonomous)", () => {
  it("defaults to compiler", async () => {
    const res = await fetch(`${base}/api/simulation/mode`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ mode: "compiler", modes: ["compiler", "autonomous"] });
  });

  it("can be switched and read back", async () => {
    const res = await post("/api/simulation/mode", { mode: "autonomous" });
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe("autonomous");
    expect((await (await fetch(`${base}/api/simulation/mode`)).json()).mode).toBe("autonomous");
  });

  it("rejects unknown modes", async () => {
    const res = await post("/api/simulation/mode", { mode: "manual" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("BAD_MODE");
    expect(simulationMode.get()).toBe("compiler");
  });

  it("needs a login to read and TRUSTED to change", async () => {
    expect((await fetch(`${base}/api/simulation/mode`, { headers: { "x-test-anon": "1" } })).status).toBe(401);
    role = "USER";
    expect((await fetch(`${base}/api/simulation/mode`)).status).toBe(200);
    expect((await post("/api/simulation/mode", { mode: "autonomous" })).status).toBe(403);
    expect(simulationMode.get()).toBe("compiler");
  });

  it("is pushed to the stream as a `mode` event so the dashboard and simulator agree", async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/simulation/stream`, { signal: ctrl.signal });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const until = async (needle: string) => {
      const deadline = Date.now() + 3000;
      while (!buf.includes(needle) && Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value);
      }
      return buf.includes(needle);
    };
    expect(await until('event: mode\ndata: {"mode":"compiler"}')).toBe(true);
    await post("/api/simulation/mode", { mode: "autonomous" });
    expect(await until('event: mode\ndata: {"mode":"autonomous"}')).toBe(true);
    ctrl.abort();
  });

  it("never exists in hardware mode — every simulation route answers 409", async () => {
    (env as any).ROBOT_MODE = "hardware";
    for (const [method, path] of [["GET", "/api/simulation/voice/health"], ["POST", "/api/simulation/voice/chat"], ["GET", "/api/simulation/mode"], ["POST", "/api/simulation/mode"], ["GET", "/api/simulation/consciousness/health"], ["POST", "/api/simulation/consciousness/think"]]) {
      const res = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json" }, body: method === "POST" ? JSON.stringify({ mode: "autonomous", request: {} }) : undefined });
      expect(res.status, `${method} ${path}`).toBe(409);
      expect((await res.json()).code).toBe("NOT_SIMULATION");
    }
    expect(simulationMode.get()).toBe("compiler"); // the refused POST changed nothing
  });

  it("is UI-only: the mode lives in memory, not in the command pipeline", async () => {
    const src = await import("node:fs").then((fs) => fs.readFileSync(join(__dirname, "../../../src/simulation/SimulationMode.ts"), "utf8"));
    expect(src).not.toMatch(/from "\.\.\/(database|commands|robot)/);
  });
});

describe("Autonomous view: language cortex endpoint", () => {
  it("reports that no LLM is configured and still lets the local mind run", async () => {
    const res = await fetch(`${base}/api/simulation/consciousness/health`);
    expect(res.status).toBe(200);
    expect((await res.json()).llm).toMatchObject({ configured: false, provider: "none" });
  });

  it("answers 503 on /think with no key, so the client falls back to the local mind", async () => {
    const res = await post("/api/simulation/consciousness/think", { request: {} });
    expect(res.status).toBe(503);
  });

  it("needs TRUSTED to think", async () => {
    role = "USER";
    expect((await post("/api/simulation/consciousness/think", { request: {} })).status).toBe(403);
  });
});

describe("simulator static hosting", () => {
  it("serves nested view folders", async () => {
    const res = await fetch(`${base}/simulation/compiler/index.html`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("compiler view");
  });

  it("lets the dashboard origin embed it, but only that origin", async () => {
    const res = await fetch(`${base}/simulation/`);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors 'self' http://localhost:5173");
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain("script-src *");
    expect(res.headers.get("x-frame-options")).toBeNull();
    expect(simulationCsp("https://dash.example")).toContain("frame-ancestors 'self' https://dash.example");
  });
});

describe("Compiler view: program pushed from the dashboard Compiler page", () => {
  const SRC = 'EYE_CENTER\nREPEAT 2 TIMES\n  EYE_LEFT 20\n  WAIT 300\nEND\n';

  it("starts empty", async () => {
    expect(await (await fetch(`${base}/api/simulation/program`)).json()).toEqual({ program: null });
  });

  it("compiles on the server, serves the flat IR and what every stage produced", async () => {
    role = "ADMIN";
    const res = await post("/api/simulation/program", { source: SRC, sourceName: "demo.vs" });
    expect(res.status).toBe(200);
    expect((await res.json()).program).toMatchObject({ sourceName: "demo.vs", count: 5, ok: true, seq: 1 });
    const { program } = await (await fetch(`${base}/api/simulation/program`)).json();
    expect(program.instructions.map((i: any) => i.op === "SLEEP" ? `WAIT ${i.ms}` : i.command)).toEqual(["EYE_CENTER", "EYE_LEFT", "WAIT 300", "EYE_LEFT", "WAIT 300"]);
    expect(program.source).toBe(SRC);
    expect(program.stages.map((s: any) => s.status)).toEqual(["ok", "ok", "ok", "ok"]);
    expect(program.tree[0]).toBe("PROGRAM");
    expect(program.tokens.length).toBeGreaterThan(5);
    expect(program.checks.map((c: any) => c.question)).toEqual(expect.arrayContaining(["Is EYE_CENTER a real command?", "Is the number after WAIT okay?", "Is the REPEAT number too big?"]));
    expect(program.checks.every((c: any) => c.ok)).toBe(true);
  });

  it("a script that does not compile is reported (422) and shown with the stage that stopped it", async () => {
    role = "ADMIN";
    const res = await post("/api/simulation/program", { source: "EYE_CENTER\nFLY_AWAY 3\n", autoplay: true });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("COMPILE_FAILED");
    const p = simulationProgram.get()!;
    expect(p.ok).toBe(false);
    expect(p.autoplay).toBe(false); // never autoplays something that didn't compile
    expect(p.instructions).toEqual([]);
    expect(p.stages.map((s) => s.status)).toEqual(["ok", "ok", "failed", "skipped"]);
    expect(p.checks.find((c) => c.question === "Is FLY_AWAY a real command?")).toMatchObject({ ok: false, answer: "Error" });
  });

  it("is ADMIN-only and honours the compiler kill switch", async () => {
    role = "TRUSTED";
    expect((await post("/api/simulation/program", { source: SRC })).status).toBe(403);
    role = "ADMIN"; compilerOn = false;
    const res = await post("/api/simulation/program", { source: SRC });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("COMPILER_DISABLED");
    expect(simulationProgram.get()).toBeNull();
  });

  it("never accepts hand-made IR — only source text", async () => {
    role = "ADMIN";
    expect((await post("/api/simulation/program", { instructions: [{ op: "EXEC", command: "EMERGENCY_CLEAR" }] })).status).toBe(400);
  });

  it("is pushed over the stream, and replayed (without autoplay) to a late viewer", async () => {
    role = "ADMIN";
    await post("/api/simulation/program", { source: SRC, sourceName: "late.vs", autoplay: true });
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/simulation/stream?only=program`, { signal: ctrl.signal });
    const reader = res.body!.getReader(); const dec = new TextDecoder(); let buf = "";
    const deadline = Date.now() + 3000;
    while (!buf.includes("event: program") && Date.now() < deadline) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value); }
    expect(buf).toContain("event: program");
    expect(buf).toContain('"replay":true');
    expect(buf).not.toContain("event: state"); // the 20 Hz robot feed is skipped
    ctrl.abort();
  });

  it("answers 409 in hardware mode", async () => {
    (env as any).ROBOT_MODE = "hardware";
    expect((await fetch(`${base}/api/simulation/program`)).status).toBe(409);
    expect((await post("/api/simulation/program", { source: SRC })).status).toBe(409);
  });
});

describe("voice view endpoints", () => {
  it("answers a wake-word command with no AI configured", async () => {
    const res = await post("/api/simulation/voice/chat", { message: "Vision, turn left", history: [] });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.source).toBe("direct");
    expect(j.instructions[0]).toMatchObject({ op: "EXEC", command: "TURN_LEFT" });
  });
  it("needs TRUSTED to chat, and reports AI/music status to any login", async () => {
    role = "USER";
    expect((await post("/api/simulation/voice/chat", { message: "hi" })).status).toBe(403);
    const h = await fetch(`${base}/api/simulation/voice/health`);
    expect(h.status).toBe(200);
    expect(await h.json()).toMatchObject({ ai: { configured: false }, music: { configured: false } });
  });
  it("is simulation-only", async () => {
    (env as any).ROBOT_MODE = "hardware";
    expect((await post("/api/simulation/voice/chat", { message: "Vision, dance" })).status).toBe(409);
  });
});
