import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A tiny stand-in client folder so the static hosting is tested without the 5 MB model.
const dir = mkdtempSync(join(tmpdir(), "sim-"));
writeFileSync(join(dir, "index.html"), "<html>sim client</html>");
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
const turns: any[] = [];
vi.mock("../../../src/routes/conversation.routes", () => ({
  handleConversationTurn: async (req: any, res: any) => { turns.push(req.body); res.json({ acted: true, replies: [{ text: "ok" }] }); },
}));
vi.mock("../../../src/camera/CameraService", () => ({ cameraService: { capture: async () => ({}) } }));
vi.mock("../../../src/robot/heartbeat", () => ({ ingestHeartbeat: () => undefined }));
vi.mock("../../../src/config/env", async (orig) => {
  const actual = await orig<typeof import("../../../src/config/env")>();
  return { env: { ...actual.env, ROBOT_MODE: "simulation" as "simulation" | "hardware" } };
});

const { simulationRouter, simulationStatic } = await import("../../../src/routes/simulation.routes");
const { simulatedRobot } = await import("../../../src/robot/SimulatedRobot");
const { env } = await import("../../../src/config/env");
const { pendingCommandQueue } = await import("../../../src/commands/PendingCommandQueue");

let server: Server; let base: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", simulationRouter);
  app.use("/simulation", simulationStatic);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  simulatedRobot.start("vision-001");
});
afterAll(() => { simulatedRobot.stop(); server.close(); });

describe("simulation routes", () => {
  it("serves the 3D client page", async () => {
    const res = await fetch(`${base}/simulation/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("sim client");
  });

  it("state snapshot requires a login", async () => {
    expect((await fetch(`${base}/api/simulation/state`, { headers: { "x-test-anon": "1" } })).status).toBe(401);
    const res = await fetch(`${base}/api/simulation/state`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ mode: "simulation", headAngle: 90, pose: { x: 0, z: 0 } });
  });

  it("/say hands the text to the real conversation pipeline as a transcript (no audio)", async () => {
    turns.length = 0;
    const res = await fetch(`${base}/api/simulation/say`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "  Vision, turn left " }) });
    expect(res.status).toBe(200);
    expect(turns[0].segments[0]).toMatchObject({ transcript: "Vision, turn left", isAdmin: false });
    expect(turns[0].segments[0].audioBase64).toBeUndefined();
  });

  it("a logged-in ADMIN is passed through as an identified admin", async () => {
    role = "ADMIN"; turns.length = 0;
    await fetch(`${base}/api/simulation/say`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Vision stop" }) });
    expect(turns[0].segments[0].isAdmin).toBe(true);
    role = "TRUSTED";
  });

  it("plain USER accounts can watch but not command", async () => {
    role = "USER";
    const res = await fetch(`${base}/api/simulation/say`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "turn left" }) });
    expect(res.status).toBe(403);
    role = "TRUSTED";
  });

  it("validates the text", async () => {
    for (const text of ["", "   ", "x".repeat(501), 42]) {
      const res = await fetch(`${base}/api/simulation/say`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      expect(res.status).toBe(400);
    }
  });

  it("streams hello, live state and speech over Server-Sent Events", async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/simulation/stream`, { signal: ctrl.signal });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
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
    expect(await until("event: hello")).toBe(true);

    pendingCommandQueue.enqueue("vision-001", "c1", "EYE_SET", { angle: 20 });
    pendingCommandQueue.enqueue("vision-001", "c2", "AUDIO_SPEAK", { text: "Hi from the robot" });
    expect(await until("event: speech")).toBe(true);
    expect(buf).toContain("Hi from the robot");
    expect(await until('"headAngle":20')).toBe(true);
    ctrl.abort();
  });

  it("is refused outright in hardware mode", async () => {
    (env as any).ROBOT_MODE = "hardware";
    try {
      const res = await fetch(`${base}/api/simulation/state`);
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe("NOT_SIMULATION");
    } finally {
      (env as any).ROBOT_MODE = "simulation";
    }
  });
});
