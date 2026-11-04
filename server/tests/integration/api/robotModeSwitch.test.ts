import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "robotmode-"));
process.env.ROBOT_MODE_FILE = path.join(dir, "robot-mode.json");

// The REAL sign-in and role checks run; only the session lookup is faked: the token "admin" is an ADMIN, "user" is a USER, anything else is unknown.
// (An earlier version of this test mocked the checks away, which hid a missing sign-in check on the route.)
vi.mock("../../../src/auth/SessionService", () => ({
  sessionService: { verify: async (t: string) => (t === "admin" ? { id: "1", email: "a@b.c", role: "ADMIN" } : t === "user" ? { id: "2", email: "u@b.c", role: "USER" } : null) },
}));

import { env } from "../../../src/config/env";
import { systemRouter } from "../../../src/routes/system.routes";
import { robotModeService } from "../../../src/robot/RobotModeService";
import { simulatedRobot } from "../../../src/robot/SimulatedRobot";

function serve() {
  const app = express(); app.use(express.json()); app.use("/api", systemRouter);
  return new Promise<{ url: string; close: () => void }>((resolve) => {
    const s = app.listen(0, () => resolve({ url: `http://127.0.0.1:${(s.address() as any).port}/api`, close: () => s.close() }));
  });
}
const post = (url: string, body: unknown, token = "admin") => fetch(`${url}/system/robot-mode`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

describe("switching the robot mode from the dashboard", () => {
  beforeEach(() => { robotModeService.set("simulation"); try { fs.rmSync(process.env.ROBOT_MODE_FILE!); } catch {} });
  afterAll(() => { robotModeService.set("simulation"); simulatedRobot.stop(); });

  it("lets a signed-in ADMIN switch, refuses a normal user (403) and a signed-out caller (401)", async () => {
    const s = await serve();
    try {
      expect((await post(s.url, { mode: "simulation" }, "admin")).status).toBe(200);
      expect((await post(s.url, { mode: "simulation" }, "user")).status).toBe(403);
      expect((await post(s.url, { mode: "simulation" }, "")).status).toBe(401);
    } finally { s.close(); }
  });

  it("refuses a bad mode", async () => {
    const s = await serve();
    try { expect((await post(s.url, { mode: "banana" })).status).toBe(400); } finally { s.close(); }
  });

  it("asks for confirmation before the real robot", async () => {
    const s = await serve();
    try {
      const r = await post(s.url, { mode: "hardware" });
      expect(r.status).toBe(400);
      expect((await r.json()).code).toBe("CONFIRM_REQUIRED");
      expect(env.ROBOT_MODE).toBe("simulation");
    } finally { s.close(); }
  });

  it("switches to hardware (virtual robot stops) and back (it starts), and remembers the choice", async () => {
    const s = await serve();
    try {
      const r = await post(s.url, { mode: "hardware", confirmHardware: true });
      expect(r.status).toBe(200);
      expect(env.ROBOT_MODE).toBe("hardware");
      expect(env.MOCK_MODE).toBe(false);
      expect(simulatedRobot.isRunning()).toBe(false);
      expect(JSON.parse(fs.readFileSync(process.env.ROBOT_MODE_FILE!, "utf8")).mode).toBe("hardware");
      const body = await (await post(s.url, { mode: "simulation" })).json();
      expect(body.mode).toBe("simulation");
      expect(simulatedRobot.isRunning()).toBe(true);
    } finally { s.close(); }
  });

  it("applies a remembered choice at start-up", () => {
    fs.writeFileSync(process.env.ROBOT_MODE_FILE!, JSON.stringify({ mode: "hardware" }));
    expect(robotModeService.load()).toBe("hardware");
    expect(env.ROBOT_MODE).toBe("hardware");
  });
});

describe("who-am-i check", () => {
  it("answers with the build marker so the dashboard can tell an old server from a new one", async () => {
    const s = await serve();
    try {
      const r = await fetch(`${s.url}/system/whoami`, { headers: { authorization: "Bearer admin" } });
      expect(r.status).toBe(200);
      expect((await r.json()).build).toBe("role-from-db-1");
    } finally { s.close(); }
  });
});
