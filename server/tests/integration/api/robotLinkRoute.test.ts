import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

vi.mock("../../../src/database/client", () => ({ db: { execute: async () => [] } }));
vi.mock("../../../src/middleware/auth", () => ({
  requireAuth: (req: any, res: any, next: any) => (req.headers["x-test-anon"] ? res.status(401).json({ code: "UNAUTHENTICATED" }) : next()),
  requireRobotAuth: (_r: any, _s: any, n: any) => n(),
}));
vi.mock("../../../src/middleware/authorization", () => ({ requireRole: () => (_r: any, _s: any, n: any) => n() }));

const { systemRouter } = await import("../../../src/routes/system.routes");
const { env } = await import("../../../src/config/env");

let server: Server; let base: string;
beforeAll(() => { const app = express(); app.use(express.json()); app.use("/api", systemRouter); server = app.listen(0); base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`; });
afterAll(() => server.close());

describe("GET /api/system/robot-link", () => {
  it("requires a login", async () => {
    expect((await fetch(`${base}/system/robot-link`, { headers: { "x-test-anon": "1" } })).status).toBe(401);
  });
  it("returns the mode, transport and summary the dashboard shows", async () => {
    const res = await fetch(`${base}/system/robot-link`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe(env.ROBOT_MODE);
    expect(["simulator", "websocket", "http", "none"]).toContain(body.transport);
    expect(typeof body.connected).toBe("boolean");
    expect(typeof body.summary).toBe("string");
  });
  it("the full health report names the mode too", async () => {
    const res = await fetch(`${base}/system/health/full`);
    expect((await res.json()).robotMode).toBe(env.ROBOT_MODE);
  });
  it("an admin can no longer mark a robot 'connected' by hand in hardware mode", async () => {
    const { robotRouter } = await import("../../../src/routes/robot.routes");
    const app = express(); app.use(express.json()); app.use("/api", robotRouter);
    const s = app.listen(0); const b = `http://127.0.0.1:${(s.address() as { port: number }).port}/api`;
    (env as any).ROBOT_MODE = "hardware";
    try { expect((await fetch(`${b}/robot/connect`, { method: "POST" })).status).toBe(409); }
    finally { (env as any).ROBOT_MODE = "simulation"; s.close(); }
  });
});
