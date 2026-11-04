import { describe, it, expect } from "vitest";
import { ConceptualMemory } from "../../../src/memory/conceptual/ConceptualMemory";

describe("conceptual memory", () => {
  it("TEST 13: conceptual match -> similarity result", () => {
    const cm = new ConceptualMemory([{ id: "c1", name: "red ball", features: { shape: "sphere", primaryColour: "red", dimensions: { width: 10, height: 10 }, aspectRatio: 1, texture: "smooth" } }]);
    const result = cm.compare({ shape: "sphere", primaryColour: "red", dimensions: { width: 10, height: 10 }, aspectRatio: 1, texture: "smooth" });
    expect(result.ranked[0].candidateName).toBe("red ball");
    expect(result.sufficient).toBe(true);
  });
});
