import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

let role = "TRUSTED"; let uid = "u1";
vi.mock("../../../src/middleware/auth", async (orig) => ({
  ...(await orig<any>()),
  requireAuth: (req: any, _res: any, next: any) => ((req.user = { id: uid, role }), next()),
}));
vi.mock("../../../src/middleware/authorization", async (orig) => ({
  ...(await orig<any>()),
  requireRole: (min: string) => (req: any, res: any, next: any) => {
    const rank: Record<string, number> = { USER: 0, TRUSTED: 1, ADMIN: 2 };
    return rank[req.user?.role ?? "USER"] >= rank[min] ? next() : res.status(403).json({ code: "FORBIDDEN" });
  },
}));
const store = new Map<string, any>(); let down = false;
vi.mock("../../../src/repositories/mindState.repository", () => ({
  mindStateRepository: {
    get: async (id: string) => { if (down) throw new Error("db"); return store.get(id) ?? null; },
    put: async (id: string, state: any) => { if (down) throw new Error("db"); const r = { state, updatedAt: new Date() }; store.set(id, r); return r; },
    delete: async (id: string) => { if (down) throw new Error("db"); store.delete(id); },
  },
}));

const { simulationRouter } = await import("../../../src/routes/simulation.routes");
let server: Server; let base: string;
beforeAll(() => { const app = express(); app.use(express.json({ limit: "1mb" })); app.use("/api", simulationRouter); server = app.listen(0); base = `http://127.0.0.1:${(server.address() as any).port}/api/simulation/mind-state`; });
afterAll(() => server.close());
beforeEach(() => { role = "TRUSTED"; uid = "u1"; down = false; store.clear(); });
const put = (b: unknown) => fetch(base, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

describe("mind-state", () => {
  it("saves, reads back, and keeps each user separate", async () => {
    expect((await put({ state: { v: 1, savedAt: 5 } })).status).toBe(200);
    expect((await (await fetch(base)).json()).state).toEqual({ v: 1, savedAt: 5 });
    uid = "u2";
    expect((await (await fetch(base)).json()).state).toBeNull();
  });
  it("needs TRUSTED, rejects junk and huge bodies", async () => {
    role = "USER"; expect((await put({ state: {} })).status).toBe(403);
    role = "TRUSTED";
    expect((await put({ state: "x" })).status).toBe(400);
    expect((await put({ state: { blob: "a".repeat(250_000) } })).status).toBe(413);
  });
  it("deletes, and answers 503 when the database is down", async () => {
    await put({ state: { v: 1 } });
    expect((await fetch(base, { method: "DELETE" })).status).toBe(200);
    expect((await (await fetch(base)).json()).state).toBeNull();
    down = true;
    expect((await fetch(base)).status).toBe(503);
    expect((await put({ state: { v: 1 } })).status).toBe(503);
  });
});
