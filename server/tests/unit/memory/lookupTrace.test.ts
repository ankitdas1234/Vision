import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/ai/aiFallback", () => ({ aiFallback: vi.fn(async (q: string) => q === "ai-down" ? { text: "", confidence: 0, success: false, error: "no AI configured" } : { text: `AI says ${q}`, confidence: 0.6, success: true }) }));
vi.mock("../../../src/repositories/memory.repository", () => ({ memoryRepository: { conceptual: { learn: vi.fn(async () => ({})) } } }));

import { MemoryManager } from "../../../src/memory/MemoryManager";
import { StaticMemory } from "../../../src/memory/static/StaticMemory";
import { DynamicMemory } from "../../../src/memory/dynamic/DynamicMemory";

const mk = () => {
  const s = new StaticMemory([{ id: "1", memoryKey: "item.apple", memoryType: "ADMIN", title: "Apple", content: "A red fruit.", importance: 1 }]);
  const d = new DynamicMemory([
    { id: "d1", title: "Zebra", content: "A striped horse.", source: "ADMIN", confidence: 1, importance: 0.5, verificationStatus: "VERIFIED", createdAt: "" },
    { id: "d2", title: "Banana peel", content: "Slippery.", source: "AI", confidence: 0.6, importance: 0.5, verificationStatus: "REQUIRES_REVIEW", createdAt: "" },
  ]);
  return new MemoryManager(s, d);
};

describe("MemoryManager.lookup trace", () => {
  it("static answers first and stops", async () => {
    const r = await mk().lookup("apple");
    expect(r.source).toBe("STATIC");
    expect(r.trace.map((t) => `${t.layer}:${t.outcome}`)).toEqual(["STATIC:hit"]);
  });
  it("dynamic answers after a static miss", async () => {
    const r = await mk().lookup("zebra");
    expect(r.source).toBe("DYNAMIC");
    expect(r.trace.map((t) => `${t.layer}:${t.outcome}`)).toEqual(["STATIC:miss", "DYNAMIC:hit"]);
  });
  it("an unverified dynamic fact is not an answer but is mentioned", async () => {
    const r = await mk().lookup("banana peel");
    expect(r.source).toBe("AI");
    expect(r.trace[1].note).toMatch(/not VERIFIED/);
  });
  it("falls to the AI last, and reports when the AI is unavailable", async () => {
    const m = mk();
    const ok = await m.lookup("quasar");
    expect(ok.source).toBe("AI");
    expect(ok.trace.map((t) => t.layer)).toEqual(["STATIC", "DYNAMIC", "CONCEPTUAL", "AI"]);
    const down = await m.lookup("ai-down");
    expect(down.trace.at(-1)).toMatchObject({ layer: "AI", outcome: "miss" });
  });
  it("one-letter searches never match everything", async () => {
    const r = await mk().lookup("a");
    expect(r.trace[0].outcome).toBe("miss");
  });
  it("learns a concept from an AI answer when it can describe the item", async () => {
    const m = mk();
    const r = await m.lookup("football", { shape: "round", primaryColour: "white", texture: "smooth", aspectRatio: 1, dimensions: { width: 22, height: 22 } } as any);
    expect(r.learnedConcept).toBe(true);
    const again = await m.lookup("soccer ball", { shape: "round", primaryColour: "white", texture: "smooth", aspectRatio: 1, dimensions: { width: 22, height: 22 } } as any);
    expect(again.source).toBe("CONCEPTUAL");
  });
});

describe("MemoryManager.lookup memory only (useAI: false)", () => {
  it("static hit says how it was found", async () => {
    const r = await mk().lookup("apple", undefined, { useAI: false });
    expect(r.found).toBe(true);
    expect(r.foundBy).toMatch(/Static/);
    expect(r.matches[0]).toMatchObject({ layer: "STATIC", title: "Apple" });
    expect(r.matches[0].matchedIn).toContain("title");
  });
  it("matched in content only is reported as content, found by Dynamic (admin-taught)", async () => {
    const r = await mk().lookup("striped", undefined, { useAI: false });
    expect(r.found).toBe(true);
    expect(r.foundBy).toMatch(/Dynamic.*taught by an admin/);
    expect(r.matches[0].matchedIn).toEqual(["content"]);
  });
  it("a verified fact the AI learned earlier is labelled as such", async () => {
    const m = new MemoryManager(new StaticMemory([]), new DynamicMemory([{ id: "x", title: "Quasar", content: "Bright galaxy core.", source: "AI", confidence: 0.9, importance: 0.5, verificationStatus: "VERIFIED", createdAt: "" }]));
    const r = await m.lookup("quasar", undefined, { useAI: false });
    expect(r.foundBy).toMatch(/learned earlier from the AI/);
  });
  it("not found says Not found and never calls the AI", async () => {
    const r = await mk().lookup("quasar", undefined, { useAI: false });
    expect(r.found).toBe(false);
    expect(r.source).toBe("NONE");
    expect(r.basis).toMatch(/^Not found in memory/);
    expect(JSON.stringify(r)).not.toMatch(/AI says/);
  });
  it("an unverified fact is mentioned but not counted", async () => {
    const r = await mk().lookup("banana peel", undefined, { useAI: false });
    expect(r.found).toBe(false);
    expect(r.basis).toMatch(/not verified/);
    expect(r.matches[0].title).toBe("Banana peel");
  });
});

describe("the robot's own lookup still falls back to the AI", () => {
  it("default lookup answers from the AI when memory has nothing", async () => {
    const r = await mk().lookup("quasar");
    expect(r.source).toBe("AI");
    expect(r.found).toBe(false);
    expect(r.inMemory).toBe(false);
  });
});
