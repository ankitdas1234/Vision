import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const dispatched: { type: string; params?: unknown }[] = [];
vi.mock("../../../src/commands/CommandRegistry", () => ({
  commandRegistry: { dispatch: async (i: { type: string; params?: unknown }) => { dispatched.push(i); return { success: true, type: i.type }; } },
}));
vi.mock("../../../src/middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.user = { id: "u", role: "ADMIN" }; next(); },
  requireRobotAuth: (_r: any, _s: any, n: any) => n(),
}));
vi.mock("../../../src/middleware/authorization", () => ({ requireRole: () => (_r: any, _s: any, n: any) => n() }));

const { servosRouter } = await import("../../../src/routes/servos.routes");

let server: Server; let base: string;
beforeAll(() => { const app = express(); app.use(express.json()); app.use("/api", servosRouter); server = app.listen(0); base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`; });
afterAll(() => server.close());
const post = (path: string, body: unknown = {}) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("servo routes for the 3-servo layout", () => {
  it("channel 1 = left leg, channel 2 = right leg", async () => {
    dispatched.length = 0;
    await post("/servos/1/move", { speed: 40 });
    await post("/servos/2/move", { speed: -40 });
    await post("/servos/1/stop"); await post("/servos/2/stop");
    expect(dispatched.map((d) => d.type)).toEqual(["LEFT_LEG_ROTATE", "RIGHT_LEG_ROTATE", "LEFT_LEG_STOP", "RIGHT_LEG_STOP"]);
  });

  it("the head (channel 0) is not a leg: move/stop on it are rejected, never routed to a leg", async () => {
    dispatched.length = 0;
    expect((await post("/servos/0/move", { speed: 40 })).status).toBe(400);
    expect((await post("/servos/0/stop")).status).toBe(400);
    expect(dispatched).toHaveLength(0);
  });

  it("unknown channels are rejected rather than silently stopping the right leg", async () => {
    dispatched.length = 0;
    for (const ch of [3, 7, 15, "abc"]) {
      expect((await post(`/servos/${ch}/stop`)).status).toBe(400);
      expect((await post(`/servos/${ch}/move`, { speed: 10 })).status).toBe(400);
    }
    expect(dispatched).toHaveLength(0);
  });

  it("only the head can be centred", async () => {
    dispatched.length = 0;
    expect((await post("/servos/0/center")).status).toBe(200);
    expect(dispatched.map((d) => d.type)).toEqual(["EYE_CENTER"]);
    expect((await post("/servos/1/center")).status).toBe(400);
  });

  it("the dedicated head routes dispatch the EYE_* commands", async () => {
    dispatched.length = 0;
    await post("/servos/eye/move", { angle: 120 });
    await post("/servos/eye/center");
    expect(dispatched.map((d) => d.type)).toEqual(["EYE_SET", "EYE_CENTER"]);
  });
});
