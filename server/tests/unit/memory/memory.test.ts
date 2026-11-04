import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/ai/aiFallback", () => ({
  aiFallback: vi.fn(),
}));

// Without this, MemoryManager's real learning step below would fire a
// real (fire-and-forget, .catch()'d) database write on every test run —
// harmless since it's never awaited, but wasteful and untestable. Mocked
// so these tests can assert persistence actually gets called, not just
// that it doesn't crash.
vi.mock("../../../src/repositories/memory.repository", () => ({
  memoryRepository: { conceptual: { learn: vi.fn().mockResolvedValue({}) } },
}));

import { MemoryManager } from "../../../src/memory/MemoryManager";
import { StaticMemory } from "../../../src/memory/static/StaticMemory";
import { aiFallback } from "../../../src/ai/aiFallback";
import { memoryRepository } from "../../../src/repositories/memory.repository";

const mockAiFallback = vi.mocked(aiFallback);
const mockLearn = vi.mocked(memoryRepository.conceptual.learn);

describe("memory priority chain", () => {
  it("TEST 11: known fact in static memory -> no AI call required (source=STATIC)", async () => {
    const staticMemory = new StaticMemory([{ id: "1", memoryKey: "vision.identity", memoryType: "IDENTITY", title: "Vision identity", content: "Vision is a robot", importance: 1 }]);
    const mm = new MemoryManager(staticMemory);
    const result = await mm.lookup("identity");
    expect(result.source).toBe("STATIC");
  });

  it("TEST 12: dynamic memory match -> dynamic result (source=DYNAMIC)", async () => {
    const mm = new MemoryManager();
    mm.dynamicMemory.add({ id: "d1", title: "New fact", content: "test content", source: "ADMIN", confidence: 0.9, importance: 0.5, verificationStatus: "VERIFIED", createdAt: new Date().toISOString() });
    const result = await mm.lookup("new fact");
    expect(result.source).toBe("DYNAMIC");
  });

  it("TEST 13: a known-looking object with a real visual match resolves via CONCEPTUAL, never reaching AI", async () => {
    mockAiFallback.mockClear();
    const mm = new MemoryManager();
    mm.conceptualMemory.addCandidate({
      id: "c1",
      name: "red ball",
      features: { shape: "square", primaryColour: "red", dimensions: { width: 100, height: 100 }, aspectRatio: 1 },
    });

    // A near-identical sighting — same shape/colour/aspect, close size.
    const result = await mm.lookup("unknown_round_thing", {
      shape: "square",
      primaryColour: "red",
      dimensions: { width: 105, height: 98 },
      aspectRatio: 1.07,
    });

    expect(result.source).toBe("CONCEPTUAL");
    expect(mockAiFallback).not.toHaveBeenCalled();
  });

  it("TEST 14: an object with no visual match at all, and nothing in static/dynamic, falls through to AI", async () => {
    mockAiFallback.mockClear();
    mockAiFallback.mockResolvedValue({ text: "a stapler", confidence: 0.8, success: true });
    const mm = new MemoryManager();

    const result = await mm.lookup("unknown_object", { shape: "wide", primaryColour: "black", dimensions: { width: 50, height: 20 }, aspectRatio: 2.5 });

    expect(result.source).toBe("AI");
    expect(mockAiFallback).toHaveBeenCalledTimes(1);
  });

  it("TEST 15: a confident AI answer for an object is remembered — the SAME shape/colour resolves via CONCEPTUAL next time, without calling AI again", async () => {
    mockAiFallback.mockClear();
    mockAiFallback.mockResolvedValue({ text: "stapler", confidence: 0.8, success: true });
    const mm = new MemoryManager();
    const features = { shape: "wide" as const, primaryColour: "black", dimensions: { width: 50, height: 20 }, aspectRatio: 2.5 };

    const first = await mm.lookup("stapler", features);
    expect(first.source).toBe("AI");
    expect(mockAiFallback).toHaveBeenCalledTimes(1);

    // Second sighting: same visual signature, no static/dynamic entry either.
    const second = await mm.lookup("stapler", { ...features, dimensions: { width: 52, height: 19 } });
    expect(second.source).toBe("CONCEPTUAL");
    expect(mockAiFallback).toHaveBeenCalledTimes(1); // not called again
  });

  it("TEST 16: a LOW-confidence AI answer is not memorized as a concept (avoids confidently learning a wrong guess)", async () => {
    mockAiFallback.mockClear();
    mockAiFallback.mockResolvedValue({ text: "maybe a widget?", confidence: 0.2, success: true });
    const mm = new MemoryManager();
    const features = { shape: "square" as const, primaryColour: "gray", dimensions: { width: 30, height: 30 }, aspectRatio: 1 };

    await mm.lookup("mystery_thing", features);
    const second = await mm.lookup("mystery_thing", features);
    expect(second.source).toBe("AI"); // still had to ask again — nothing was learned
    expect(mockAiFallback).toHaveBeenCalledTimes(2);
  });

  it("TEST 17: a person-identity lookup (no features) never touches CONCEPTUAL, even with candidates loaded", async () => {
    mockAiFallback.mockClear();
    mockAiFallback.mockResolvedValue({ text: "", confidence: 0, success: true });
    const mm = new MemoryManager();
    mm.conceptualMemory.addCandidate({ id: "c1", name: "irrelevant", features: { shape: "square", primaryColour: "red", aspectRatio: 1 } });

    const result = await mm.lookup("unknown_person"); // no features — this is the person-lookup shape
    expect(result.source).toBe("AI");
  });

  it("TEST 18: a confidently-learned concept is persisted to the database, not just kept in-memory", async () => {
    mockAiFallback.mockClear();
    mockLearn.mockClear();
    mockAiFallback.mockResolvedValue({ text: "a red mug", confidence: 0.9, success: true });
    const mm = new MemoryManager();
    const features = { shape: "square" as const, primaryColour: "red", dimensions: { width: 40, height: 42 }, aspectRatio: 0.95 };

    await mm.lookup("mug", features);

    // Not awaited by lookup() itself (fire-and-forget — see the
    // implementation's comment on why), so give the microtask queue a
    // tick to let the .catch()-guarded call actually fire.
    await new Promise((r) => setTimeout(r, 0));
    expect(mockLearn).toHaveBeenCalledWith("mug", features, 0.9);
  });

  it("TEST 19: a low-confidence AI answer is never persisted either", async () => {
    mockAiFallback.mockClear();
    mockLearn.mockClear();
    mockAiFallback.mockResolvedValue({ text: "not sure", confidence: 0.1, success: true });
    const mm = new MemoryManager();

    await mm.lookup("mystery", { shape: "wide" as const, primaryColour: "gray", aspectRatio: 2 });
    await new Promise((r) => setTimeout(r, 0));
    expect(mockLearn).not.toHaveBeenCalled();
  });

  it("TEST 20: a failed persistence write does not throw or break the lookup result", async () => {
    mockAiFallback.mockClear();
    mockLearn.mockClear();
    mockAiFallback.mockResolvedValue({ text: "a chair", confidence: 0.9, success: true });
    mockLearn.mockRejectedValueOnce(new Error("database unavailable"));
    const mm = new MemoryManager();

    const result = await mm.lookup("chair", { shape: "tall" as const, primaryColour: "brown", aspectRatio: 0.4 });
    expect(result.source).toBe("AI"); // the lookup itself still succeeded
    await new Promise((r) => setTimeout(r, 0)); // let the rejected background write settle without an unhandled rejection
  });
});
