import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/repositories/memory.repository", () => ({
  memoryRepository: {
    static: { list: vi.fn() },
    dynamic: { list: vi.fn() },
    conceptual: { list: vi.fn() },
  },
}));

import { loadMemoryFromDatabase } from "../../../src/memory/MemoryPersistence";
import { MemoryManager } from "../../../src/memory/MemoryManager";
import { memoryRepository } from "../../../src/repositories/memory.repository";

const mockStaticList = vi.mocked(memoryRepository.static.list);
const mockDynamicList = vi.mocked(memoryRepository.dynamic.list);
const mockConceptualList = vi.mocked(memoryRepository.conceptual.list);

describe("loadMemoryFromDatabase", () => {
  beforeEach(() => {
    mockStaticList.mockReset();
    mockDynamicList.mockReset();
    mockConceptualList.mockReset();
  });

  it("loads static memory rows into the manager's StaticMemory", async () => {
    mockStaticList.mockResolvedValue([
      { id: "s1", memoryKey: "vision.identity", memoryType: "IDENTITY", title: "Identity", content: "Vision is a robot", importance: 1, metadata: null, createdAt: new Date(), updatedAt: new Date() },
    ] as never);
    mockDynamicList.mockResolvedValue([] as never);
    mockConceptualList.mockResolvedValue([] as never);

    const mm = new MemoryManager();
    await loadMemoryFromDatabase(mm);

    const result = await mm.lookup("identity");
    expect(result.source).toBe("STATIC");
  });

  it("loads verified dynamic memory rows into the manager's DynamicMemory", async () => {
    mockStaticList.mockResolvedValue([] as never);
    mockDynamicList.mockResolvedValue([
      { id: "d1", robotId: null, personId: null, observationId: null, memoryType: "FACT", title: "Learned fact", content: "the sky is blue", source: "ADMIN", confidence: 0.9, importance: 0.5, verificationStatus: "VERIFIED", requiresReview: false, metadata: null, createdAt: new Date(), updatedAt: new Date() },
    ] as never);
    mockConceptualList.mockResolvedValue([] as never);

    const mm = new MemoryManager();
    await loadMemoryFromDatabase(mm);

    const result = await mm.lookup("learned fact");
    expect(result.source).toBe("DYNAMIC");
  });

  it("loads conceptual memory rows (with a featureVector) into the manager's ConceptualMemory", async () => {
    mockStaticList.mockResolvedValue([] as never);
    mockDynamicList.mockResolvedValue([] as never);
    mockConceptualList.mockResolvedValue([
      {
        id: "c1", objectId: "o1", observationId: null, conceptName: "red ball", conceptCategory: "square",
        description: null, confidence: 0.8,
        featureVector: { shape: "square", primaryColour: "red", dimensions: { width: 100, height: 100 }, aspectRatio: 1 },
        semanticVector: null, metadata: null, createdAt: new Date(), updatedAt: new Date(),
      },
    ] as never);

    const mm = new MemoryManager();
    await loadMemoryFromDatabase(mm);

    const result = await mm.lookup("unknown_round_thing", { shape: "square", primaryColour: "red", dimensions: { width: 102, height: 99 }, aspectRatio: 1.03 });
    expect(result.source).toBe("CONCEPTUAL");
  });

  it("skips a conceptual row with no featureVector (can't be compared) rather than crashing", async () => {
    mockStaticList.mockResolvedValue([] as never);
    mockDynamicList.mockResolvedValue([] as never);
    mockConceptualList.mockResolvedValue([
      { id: "c1", objectId: "o1", observationId: null, conceptName: "mystery", conceptCategory: null, description: null, confidence: 0.5, featureVector: null, semanticVector: null, metadata: null, createdAt: new Date(), updatedAt: new Date() },
    ] as never);

    const mm = new MemoryManager();
    await expect(loadMemoryFromDatabase(mm)).resolves.toBeUndefined();
  });

  it("degrades gracefully (empty memory, no throw) when the database is unreachable", async () => {
    mockStaticList.mockRejectedValue(new Error("ECONNREFUSED"));

    const mm = new MemoryManager();
    await expect(loadMemoryFromDatabase(mm)).resolves.toBeUndefined();

    const result = await mm.lookup("anything");
    expect(result.source).toBe("AI"); // nothing loaded, so it falls all the way through
  });
});
