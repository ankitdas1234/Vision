import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

let role = "ADMIN";
vi.mock("../../../src/middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => ((req.user = { id: "u1", role }), next()),
}));
vi.mock("../../../src/middleware/authorization", () => ({
  requireRole: (min: string) => (req: any, res: any, next: any) => {
    const rank: Record<string, number> = { USER: 0, TRUSTED: 1, ADMIN: 2 };
    return rank[req.user?.role ?? "USER"] >= rank[min] ? next() : res.status(403).json({ code: "FORBIDDEN" });
  },
}));

// Fake "database" so we can prove writes happen and survive a reload.
const db = { dynamic: [] as any[], statics: [] as any[] };
let failWrites = false;
vi.mock("../../../src/repositories/memory.repository", () => ({
  memoryRepository: {
    dynamic: {
      create: async (r: any) => { if (failWrites) throw new Error("db down"); db.dynamic.push({ ...r, createdAt: new Date() }); return r; },
      delete: async (id: string) => { db.dynamic = db.dynamic.filter((x) => x.id !== id); },
      correct: async (id: string, patch: any) => { const r = db.dynamic.find((x) => x.id === id); if (r) Object.assign(r, patch, { verificationStatus: "VERIFIED" }); return r; },
      updateVerification: async (id: string, status: string) => { const r = db.dynamic.find((x) => x.id === id); if (r) r.verificationStatus = status; return r; },
      list: async () => db.dynamic,
    },
    static: {
      upsert: async (r: any) => {
        if (failWrites) throw new Error("db down");
        db.statics = db.statics.filter((x) => x.memoryKey !== r.memoryKey);
        const row = { id: "s-" + r.memoryKey, ...r }; db.statics.push(row); return row;
      },
      deleteByKey: async (k: string) => { db.statics = db.statics.filter((x) => x.memoryKey !== k); },
      list: async () => db.statics,
    },
    conceptual: { list: async () => [] },
  },
}));

const { memoryRouter } = await import("../../../src/routes/memory.routes");
const { memoryManager } = await import("../../../src/memory/MemoryManager");
const { loadMemoryFromDatabase } = await import("../../../src/memory/MemoryPersistence");
const { MemoryManager } = await import("../../../src/memory/MemoryManager");

let server: Server; let base: string;
beforeAll(() => {
  const app = express(); app.use(express.json()); app.use("/api", memoryRouter);
  server = app.listen(0); base = `http://127.0.0.1:${(server.address() as any).port}/api`;
});
afterAll(() => server.close());
beforeEach(() => {
  role = "ADMIN"; failWrites = false; db.dynamic = []; db.statics = [];
  memoryManager.dynamicMemory.all().splice(0); memoryManager.staticMemory.all().splice(0);
});
const post = (p: string, b: unknown) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

describe("admin teaching", () => {
  it("rejects non-admins", async () => {
    role = "TRUSTED";
    expect((await post("/memory/learn", { title: "Zorbo", content: "A blue planet" })).status).toBe(403);
    expect((await post("/memory/static", { title: "Zorbo", content: "A blue planet" })).status).toBe(403);
  });
  it("validates input", async () => {
    const r = await post("/memory/learn", { title: "", content: "x" });
    expect(r.status).toBe(400);
  });
  it("taught dynamic fact is VERIFIED, stored in the DB and answers a lookup", async () => {
    const r = await post("/memory/learn", { title: "Zorbo", content: "Zorbo is a blue planet" });
    const rec = await r.json();
    expect(rec).toMatchObject({ source: "ADMIN", verificationStatus: "VERIFIED", persisted: true });
    expect(db.dynamic).toHaveLength(1);
    const found = await memoryManager.lookup("zorbo");
    expect(found.source).toBe("DYNAMIC");
  });
  it("taught static fact is upserted (same title replaces) and answers from STATIC", async () => {
    await post("/memory/static", { title: "Dock Code", content: "1234" });
    await post("/memory/static", { title: "Dock Code", content: "9999" });
    expect(db.statics).toHaveLength(1);
    const found = await memoryManager.lookup("dock code");
    expect(found.source).toBe("STATIC");
    expect(JSON.stringify(found)).toContain("9999");
  });
  it("survives a restart (reload from the DB into a fresh MemoryManager)", async () => {
    await post("/memory/learn", { title: "Zorbo", content: "Zorbo is a blue planet" });
    await post("/memory/static", { title: "Dock Code", content: "1234" });
    const fresh = new MemoryManager();
    await loadMemoryFromDatabase(fresh);
    expect((await fresh.lookup("zorbo")).source).toBe("DYNAMIC");
    expect((await fresh.lookup("dock code")).source).toBe("STATIC");
  });
  it("reports persisted:false when the DB is down but still works in memory", async () => {
    failWrites = true;
    const rec = await (await post("/memory/learn", { title: "Zorbo", content: "blue planet" })).json();
    expect(rec.persisted).toBe(false);
    expect((await memoryManager.lookup("zorbo")).source).toBe("DYNAMIC");
  });
  it("deletes facts", async () => {
    const rec = await (await post("/memory/learn", { title: "Zorbo", content: "blue planet" })).json();
    expect((await fetch(`${base}/memory/dynamic/${rec.id}`, { method: "DELETE" })).status).toBe(200);
    expect(db.dynamic).toHaveLength(0);
    expect((await fetch(`${base}/memory/dynamic/${rec.id}`, { method: "DELETE" })).status).toBe(404);
  });
});

describe("richer teaching", () => {
  const put = (p: string, b: unknown) => fetch(base + p, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  it("tags facts and keeps the tag across a reload", async () => {
    await post("/memory/learn", { title: "Zorbo", content: "blue planet", tag: "space stuff" });
    await post("/memory/static", { title: "Dock Code", content: "1234", tag: "Safety" });
    expect(db.dynamic[0].memoryType).toBe("SPACE_STUFF");
    expect(db.statics[0].memoryType).toBe("SAFETY");
    const fresh = new MemoryManager(); await loadMemoryFromDatabase(fresh);
    expect(fresh.dynamicMemory.all()[0].tag).toBe("SPACE_STUFF");
  });
  it("edits a static fact in place (same key) and a dynamic fact", async () => {
    await post("/memory/static", { title: "Dock Code", content: "1234" });
    const r = await put("/memory/static/admin.dock_code", { content: "7777" });
    expect(r.status).toBe(200);
    expect(db.statics).toHaveLength(1); expect(db.statics[0].content).toBe("7777");
    expect(JSON.stringify(await memoryManager.lookup("dock code"))).toContain("7777");
    const rec = await (await post("/memory/learn", { title: "Zorbo", content: "blue planet" })).json();
    expect((await put(`/memory/dynamic/${rec.id}`, { content: "green planet" })).status).toBe(200);
    expect(db.dynamic[0].content).toBe("green planet");
    expect((await put("/memory/static/nope", { content: "xx" })).status).toBe(404);
    expect((await put(`/memory/dynamic/${rec.id}`, {})).status).toBe(400);
  });
  it("imports many facts from text, reports bad lines, and rejects abuse", async () => {
    const text = "# my facts\nZorbo | A blue planet | space\nBad line only title\nDock Code | 1234\n\nX | y";
    const r = await (await post("/memory/bulk", { kind: "dynamic", text })).json();
    expect(r.saved).toBe(2); expect(r.skipped).toBe(2); expect(r.errors[0].line).toBeGreaterThan(0);
    expect(db.dynamic).toHaveLength(2);
    const s = await (await post("/memory/bulk", { kind: "static", items: [{ title: "Hello", content: "World" }] })).json();
    expect(s.saved).toBe(1); expect(db.statics).toHaveLength(1);
    expect((await post("/memory/bulk", { kind: "nope", text: "a|b" })).status).toBe(400);
    expect((await post("/memory/bulk", { kind: "dynamic", items: Array.from({ length: 201 }, () => ({ title: "aa", content: "bb" })) })).status).toBe(400);
  });
  it("an admin can verify or reject a fact the AI learned on its own", async () => {
    const { createDynamicMemory } = await import("../../../src/memory/dynamic/learning");
    const ai = createDynamicMemory({ id: "ai-1", title: "Quokka", content: "A small marsupial", source: "AI", confidence: 0.6 });
    expect(ai.verificationStatus).toBe("REQUIRES_REVIEW");
    memoryManager.dynamicMemory.add(ai); db.dynamic.push({ id: "ai-1", title: "Quokka", verificationStatus: "REQUIRES_REVIEW" });
    expect((await memoryManager.lookup("quokka")).source).not.toBe("DYNAMIC");
    expect((await post("/memory/dynamic/ai-1/verify", {})).status).toBe(200);
    expect(db.dynamic[0].verificationStatus).toBe("VERIFIED");
    expect((await memoryManager.lookup("quokka")).source).toBe("DYNAMIC");
    expect((await post("/memory/dynamic/ai-1/reject", {})).status).toBe(200);
    expect((await memoryManager.lookup("quokka")).source).not.toBe("DYNAMIC");
    expect((await post("/memory/dynamic/missing/verify", {})).status).toBe(404);
  });
  it("only admins can use the new routes", async () => {
    role = "TRUSTED";
    expect((await post("/memory/bulk", { kind: "dynamic", text: "a | b" })).status).toBe(403);
    expect((await put("/memory/static/x", { content: "yy" })).status).toBe(403);
    expect((await post("/memory/dynamic/x/verify", {})).status).toBe(403);
  });
});
